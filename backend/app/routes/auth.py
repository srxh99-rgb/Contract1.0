# backend/app/routes/auth.py
import time
import uuid
import random
import string
import jwt
import datetime
import pyotp
import base64
import requests
import logging
from flask import Blueprint, jsonify, request, current_app
from captcha.image import ImageCaptcha

from app.db import get_db_connection
from app.extensions import limiter
from app.utils.common import get_beijing_time
from app.decorators import token_required

auth_bp = Blueprint('auth', __name__)
# 配置日志记录器
logger = logging.getLogger(__name__)

# 内存中存储验证码 (生产环境建议用Redis)
CAPTCHA_STORE = {} 

def clean_captcha_store():
    now = time.time()
    to_delete = [k for k, v in CAPTCHA_STORE.items() if now > v['expire']]
    for k in to_delete:
        del CAPTCHA_STORE[k]

def get_tenant_access_token():
    """获取飞书 Tenant Access Token"""
    try:
        app_id = current_app.config['FEISHU_APP_ID']
        app_secret = current_app.config['FEISHU_APP_SECRET']
        resp = requests.post(
            "https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal", 
            json={"app_id": app_id, "app_secret": app_secret}
        )
        return resp.json().get("tenant_access_token")
    except Exception as e:
        logger.error(f"Feishu Token Error: {e}")
        return None

@auth_bp.route('/api/captcha', methods=['GET'])
def get_captcha():
    image = ImageCaptcha(width=120, height=40)
    code = ''.join(random.choices(string.digits, k=4))
    token = uuid.uuid4().hex
    clean_captcha_store()
    CAPTCHA_STORE[token] = {'code': code, 'expire': time.time() + 300}
    data = image.generate(code)
    img_str = base64.b64encode(data.getvalue()).decode()
    return jsonify({"token": token, "image": f"data:image/png;base64,{img_str}"})

@auth_bp.route('/api/auth/verify', methods=['GET'])
@token_required
def verify_token():
    return jsonify({
        "status": "success", 
        "user": {
            "id": request.current_user_id, 
            "role": request.current_user_role, 
            "name": request.current_user_name, 
            "email": request.current_user_email,
            "username": request.current_username
        }
    })

@auth_bp.route('/api/login_admin', methods=['POST'])
@limiter.limit("20 per minute") 
def login_admin():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    captcha_token = data.get('captcha_token')
    captcha_code = data.get('captcha_code')

    # 添加日志：记录尝试登录的用户名（不记录密码）
    logger.info(f"Login attempt for user: {username}")

    if not captcha_token or not captcha_code:
        return jsonify({"error": "请输入验证码"}), 400
    
    # 验证图形验证码
    now = time.time()
    clean_captcha_store()
    stored = CAPTCHA_STORE.get(captcha_token)
    if not stored or stored['code'].lower() != captcha_code.lower():
        logger.warning(f"Captcha failed for user: {username}")
        return jsonify({"error": "图形验证码错误"}), 400
    del CAPTCHA_STORE[captcha_token]

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE username=%s", (username,))
            user = cursor.fetchone()
            
            if not user:
                logger.warning(f"Login failed: User {username} not found")
                return jsonify({"error": "账号或密码错误"}), 401
            
            # 检查锁定状态
            if user.get('lockout_until') and user['lockout_until'] > get_beijing_time():
                logger.warning(f"Login locked for user: {username}")
                # 记录锁定日志
                cursor.execute("INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, 0, 'LOGIN_LOCKED', 'N/A', %s)", (user['id'], get_beijing_time()))
                conn.commit()
                return jsonify({"error": f"账号已锁定，请在 {user['lockout_until']} 后重试"}), 403
            
            # 密码验证失败
            if user['password'] != password:
                fails = (user.get('failed_attempts') or 0) + 1
                if fails >= 5:
                    lock_until = get_beijing_time() + datetime.timedelta(minutes=15)
                    cursor.execute("UPDATE users SET failed_attempts=%s, lockout_until=%s WHERE id=%s", (fails, lock_until, user['id']))
                else:
                    cursor.execute("UPDATE users SET failed_attempts=%s WHERE id=%s", (fails, user['id']))
                
                # 记录失败日志
                cursor.execute("INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, 0, 'LOGIN_FAILED', 'N/A', %s)", (user['id'], get_beijing_time()))
                conn.commit()
                
                logger.warning(f"Password mismatch for user: {username}, fails: {fails}")
                return jsonify({"error": f"密码错误，剩余次数: {5 - fails}"}), 401
            
            # 登录成功，清除失败记录
            cursor.execute("UPDATE users SET failed_attempts=0, lockout_until=NULL WHERE id=%s", (user['id'],))
            
            SECRET_KEY = current_app.config['SECRET_KEY']

            # 强制修改密码流程
            if user.get('force_change_password'):
                setup_token = jwt.encode({
                    'user_id': user['id'], 
                    'type': 'setup_only',
                    'role': user['role'],
                    'username': user['username'], 
                    'name': user['name'],         
                    'mfa_enabled': bool(user.get('mfa_secret')), 
                    'exp': datetime.datetime.utcnow() + datetime.timedelta(minutes=15)
                }, SECRET_KEY, algorithm="HS256")
                conn.commit()
                logger.info(f"User {username} requires password setup")
                return jsonify({
                    "status": "setup_required", 
                    "token": setup_token, 
                    "user": {"id": user['id'], "name": user['name'], "mfa_enabled": bool(user.get('mfa_secret'))},
                    "message": "首次登录需修改密码"
                }), 200

            # MFA 验证流程
            if user.get('mfa_secret'):
                pre_auth_token = jwt.encode({
                    'user_id': user['id'],
                    'type': 'pre_auth_mfa',
                    'username': user['username'],
                    'exp': datetime.datetime.utcnow() + datetime.timedelta(minutes=5)
                }, SECRET_KEY, algorithm="HS256")
                conn.commit()
                logger.info(f"User {username} requires MFA")
                return jsonify({
                    "status": "mfa_required", 
                    "pre_auth_token": pre_auth_token,
                    "message": "请输入动态验证码"
                }), 200

            # 直接生成 Token (无 MFA)
            token = jwt.encode({
                'user_id': user['id'], 
                'username': user['username'], 
                'role': user['role'], 
                'name': user['name'], 
                'email': user['email'], 
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            }, SECRET_KEY, algorithm="HS256")
            
            # 根据角色记录不同的日志类型
            action_type = 'LOGIN_ADMIN' if user['role'] == 'admin' else 'LOGIN_USER'
            cursor.execute("INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, 0, %s, 'N/A', %s)", (user['id'], action_type, get_beijing_time()))
            conn.commit()
            
            logger.info(f"User {username} logged in successfully as {user['role']}")
            return jsonify({
                "status": "success", 
                "token": token, 
                "user": user,
                "mfa_enabled": False
            })
    except Exception as e:
        logger.error(f"Login Error: {e}")
        return jsonify({"error": "Login failed due to server error"}), 500
    finally: conn.close()

@auth_bp.route('/api/login/verify_mfa', methods=['POST'])
@limiter.limit("20 per minute")
def verify_login_mfa():
    data = request.json
    pre_token = data.get('pre_auth_token')
    code = data.get('mfa_code')
    SECRET_KEY = current_app.config['SECRET_KEY']

    if not pre_token or not code:
        return jsonify({"error": "参数缺失"}), 400

    try:
        payload = jwt.decode(pre_token, SECRET_KEY, algorithms=["HS256"])
        if payload.get('type') != 'pre_auth_mfa':
            return jsonify({"error": "无效的验证流程"}), 401
        user_id = payload['user_id']
    except:
        return jsonify({"error": "验证会话已过期，请重新登录"}), 401

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE id=%s", (user_id,))
            user = cursor.fetchone()
            
            if not user or not user.get('mfa_secret'):
                return jsonify({"error": "用户状态异常"}), 401

            totp = pyotp.TOTP(user['mfa_secret'])
            if not totp.verify(code, valid_window=1):
                # 记录 MFA 失败日志
                cursor.execute("INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, 0, 'LOGIN_MFA_FAILED', 'N/A', %s)", (user['id'], get_beijing_time()))
                conn.commit()
                logger.warning(f"MFA failed for user: {user.get('username')}")
                return jsonify({"error": "动态验证码错误"}), 400

            token = jwt.encode({
                'user_id': user['id'], 
                'username': user['username'], 
                'role': user['role'], 
                'name': user['name'], 
                'email': user['email'], 
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            }, SECRET_KEY, algorithm="HS256")
            
            # 记录 MFA 成功日志
            cursor.execute("INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, 0, 'LOGIN_MFA_SUCCESS', 'N/A', %s)", (user['id'], get_beijing_time()))
            conn.commit()
            
            logger.info(f"MFA verified successfully for user: {user.get('username')}")
            return jsonify({
                "status": "success",
                "token": token,
                "user": user,
                "mfa_enabled": True
            })
    finally: conn.close()

@auth_bp.route('/api/login_feishu', methods=['POST'])
@limiter.limit("20 per minute") 
def login_feishu():
    code = request.json.get('code')
    SECRET_KEY = current_app.config['SECRET_KEY']
    logger.info("Feishu login initiated")
    
    try:
        t_token = get_tenant_access_token()
        if not t_token:
            logger.error("Failed to get Feishu Tenant Token")
            return jsonify({"error": "飞书配置错误"}), 500
            
        headers = {"Authorization": f"Bearer {t_token}"}
        auth_resp = requests.post("https://open.feishu.cn/open-apis/authen/v1/oidc/access_token", json={"grant_type": "authorization_code", "code": code}, headers=headers).json()
        
        if "data" not in auth_resp: 
            logger.error(f"Feishu Auth Failed: {auth_resp}")
            return jsonify({"error": "Token失效"}), 400
        
        u_info = requests.get("https://open.feishu.cn/open-apis/authen/v1/user_info", headers={"Authorization": f"Bearer {auth_resp['data']['access_token']}"}).json().get("data", {})
        feishu_id = u_info.get("open_id")
        
        logger.info(f"Feishu user identified: {u_info.get('name')} ({feishu_id})")

        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM users WHERE feishu_open_id=%s", (feishu_id,))
                user = cursor.fetchone()
                if not user:
                    logger.info(f"Creating new user from Feishu: {u_info.get('name')}")
                    cursor.execute("INSERT INTO users (feishu_open_id, name, email, role) VALUES (%s, %s, %s, 'user')", (feishu_id, u_info.get("name"), u_info.get("email")))
                    conn.commit()
                    user_id = cursor.lastrowid
                    cursor.execute("SELECT * FROM users WHERE id=%s", (user_id,))
                    user = cursor.fetchone()
                
                if not user['is_active']: 
                    logger.warning(f"Feishu login blocked (inactive): {user['name']}")
                    return jsonify({"error": "该账号已被禁用"}), 403
                
                # 非管理员自动加入默认组
                if user['role'] != 'admin':
                    cursor.execute("INSERT IGNORE INTO group_members (group_id, user_id) SELECT id, %s FROM user_groups WHERE name='默认组'", (user['id'],))
                    conn.commit()
                
                token = jwt.encode({'user_id': user['id'], 'role': user['role'], 'name': user['name'], 'email': user['email'], 'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)}, SECRET_KEY, algorithm="HS256")
                
                cursor.execute("INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, 0, 'LOGIN_FEISHU', 'N/A', %s)", (user['id'], get_beijing_time()))
                conn.commit()
                
                logger.info(f"Feishu login success for: {user['name']}")
                return jsonify({"status": "success", "token": token, "user": user})
        finally: conn.close()
    except Exception as e: 
        logger.error(f"Feishu Login Exception: {e}")
        return jsonify({"error": str(e)}), 500
