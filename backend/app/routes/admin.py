import datetime
import pyotp
import qrcode
import io
import base64
from flask import Blueprint, jsonify, request, current_app

from app.db import get_db_connection
from app.decorators import token_required, admin_required, super_admin_required
from app.utils.common import get_beijing_time, check_password_complexity
from app.utils.db_helpers import get_user_group_ids, get_all_sub_file_ids
from app.routes.file_ops import _propagate_folder_permissions

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/api/admin/check_password', methods=['POST'])
@token_required
def check_password_reuse():
    data = request.json
    new_password = data.get('password')
    user_id = request.current_user_id
    
    if not new_password:
        return jsonify({"error": "请输入新密码"}), 400

    if not check_password_complexity(new_password):
        return jsonify({"error": "密码强度不足：需8位以上，包含大小写字母、数字及特殊符号"}), 400
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT password FROM users WHERE id=%s", (user_id,))
            current_user = cursor.fetchone()
            if str(current_user['password']).strip() == str(new_password).strip():
                return jsonify({"error": "新密码不能与当前/重置密码相同"}), 400
            return jsonify({"success": True})
    finally: conn.close()

# 🟢 修复：去掉了多余的 @ 符号
@admin_bp.route('/api/admin/complete_setup', methods=['POST'])
@token_required
def complete_initial_setup():
    data = request.json
    new_password = data.get('password')
    mfa_secret = data.get('mfa_secret')
    mfa_code = data.get('mfa_code')
    user_id = request.current_user_id

    if not new_password or not check_password_complexity(new_password):
        return jsonify({"error": "密码强度不足"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT password, mfa_secret FROM users WHERE id=%s", (user_id,))
            current_user = cursor.fetchone()
            if str(current_user['password']).strip() == str(new_password).strip():
                return jsonify({"error": "为了安全，新密码不能与初始/重置密码相同"}), 400

            db_mfa = current_user.get('mfa_secret')
            final_mfa = db_mfa
            if not db_mfa:
                if not mfa_secret or not mfa_code:
                    return jsonify({"error": "请先完成 MFA 绑定"}), 400
                totp = pyotp.TOTP(mfa_secret)
                if not totp.verify(mfa_code, valid_window=1):
                    return jsonify({"error": "MFA 验证码错误"}), 400
                final_mfa = mfa_secret
            
            cursor.execute("""
                UPDATE users SET password=%s, mfa_secret=%s, force_change_password=0 WHERE id=%s
            """, (new_password, final_mfa, user_id))
            cursor.execute("INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, 0, 'COMPLETE_SETUP', 'N/A', %s)", (user_id, get_beijing_time()))
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@admin_bp.route('/api/admin/mfa/generate', methods=['GET'])
@token_required
def generate_mfa_secret():
    user_label = request.current_username or request.current_user_name or "User"
    secret = pyotp.random_base32()
    otp_uri = pyotp.totp.TOTP(secret).provisioning_uri(name=user_label, issuer_name="SobeyContractSystem")
    img = qrcode.make(otp_uri)
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return jsonify({"secret": secret, "qr_code": f"data:image/png;base64,{img_str}"})

@admin_bp.route('/api/admin/mfa/bind', methods=['POST'])
@token_required
def bind_mfa():
    data = request.json
    secret = data.get('secret')
    code = data.get('code')
    user_id = request.current_user_id
    if not secret or not code: return jsonify({"error": "缺少参数"}), 400
    totp = pyotp.TOTP(secret)
    if not totp.verify(code, valid_window=1): return jsonify({"error": "验证码错误，绑定失败"}), 400
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE users SET mfa_secret=%s WHERE id=%s", (secret, user_id))
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@admin_bp.route('/api/admin/mfa/unbind', methods=['POST'])
@admin_required
def unbind_mfa():
    target_user_id = request.json.get('user_id')
    current_user_id = request.current_user_id
    is_super = request.current_username == 'admin'
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if str(target_user_id) != str(current_user_id) and not is_super:
                cursor.execute("SELECT role FROM users WHERE id=%s", (target_user_id,))
                target_user = cursor.fetchone()
                if target_user and target_user['role'] == 'admin':
                    return jsonify({"error": "Permission denied"}), 403
            cursor.execute("UPDATE users SET mfa_secret=NULL WHERE id=%s", (target_user_id,))
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@admin_bp.route('/api/admin/admins', methods=['GET'])
@super_admin_required
def get_admin_list():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, username, name, email, IF(mfa_secret IS NOT NULL, 1, 0) as mfa_enabled, is_active, created_at FROM users WHERE role='admin' AND username != 'admin'")
            return jsonify(cursor.fetchall())
    finally: conn.close()

@admin_bp.route('/api/admin/create_admin', methods=['POST'])
@super_admin_required
def create_admin():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    name = data.get('name', '管理员')
    if not username or not password: return jsonify({"error": "Username and password required"}), 400
    if not check_password_complexity(password): return jsonify({"error": "密码强度不足"}), 400
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE username=%s", (username,))
            if cursor.fetchone(): return jsonify({"error": "用户名已存在"}), 400
            cursor.execute("INSERT INTO users (username, password, name, email, role, is_active, force_change_password) VALUES (%s, %s, %s, '', 'admin', 1, 1)", (username, password, name))
            new_id = cursor.lastrowid
            cursor.execute("INSERT INTO group_members (group_id, user_id) SELECT id, %s FROM user_groups WHERE name='管理组'", (new_id,))
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@admin_bp.route('/api/admin/reset_password', methods=['POST'])
@super_admin_required
def admin_reset_password():
    data = request.json
    target_id = data.get('user_id')
    new_password = data.get('password')
    if not target_id or not new_password: return jsonify({"error": "Missing parameters"}), 400
    if not check_password_complexity(new_password): return jsonify({"error": "密码强度不足"}), 400
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE users SET password=%s, force_change_password=1 WHERE id=%s", (new_password, target_id))
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@admin_bp.route('/api/admin/delete_admin/<int:uid>', methods=['DELETE'])
@super_admin_required
def delete_admin_account(uid):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM group_members WHERE user_id=%s", (uid,))
            cursor.execute("DELETE FROM folder_permissions WHERE subject_type='user' AND subject_id=%s", (uid,))
            cursor.execute("DELETE FROM contract_permissions WHERE subject_type='user' AND subject_id=%s", (uid,))
            cursor.execute("DELETE FROM users WHERE id=%s", (uid,))
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@admin_bp.route('/api/admin/update_profile', methods=['POST'])
@admin_required
def update_admin_profile():
    data = request.json
    new_username = data.get('username')
    new_password = data.get('password')
    user_id = request.current_user_id
    if new_password and not check_password_complexity(new_password): return jsonify({"error": "密码强度不足"}), 400
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if new_username: cursor.execute("UPDATE users SET username=%s WHERE id=%s", (new_username, user_id))
            if new_password: cursor.execute("UPDATE users SET password=%s WHERE id=%s", (new_password, user_id))
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@admin_bp.route('/api/admin/groups/<int:gid>', methods=['PUT'])
@admin_required
def update_group_name(gid):
    name = request.json.get('name')
    if not name: return jsonify({"error": "Name required"}), 400
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE user_groups SET name=%s WHERE id=%s", (name, gid))
            conn.commit()
            return jsonify({"success": True})
    except: return jsonify({"error": "Duplicate name"}), 400
    finally: conn.close()

@admin_bp.route('/api/permissions/<int:cid>', methods=['GET'])
@admin_required
def get_file_permissions(cid):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, name, email FROM users WHERE role != 'admin'")
            users = cursor.fetchall()
            cursor.execute("SELECT * FROM contract_permissions WHERE contract_id = %s", (cid,))
            perms = cursor.fetchall()
            perm_map = {f"{p['subject_type']}_{p['subject_id']}": p for p in perms}
            cursor.execute("SELECT id, name FROM user_groups")
            groups = cursor.fetchall()
            result = []
            for u in users:
                user_gids = get_user_group_ids(cursor, u['id'])
                direct_p = perm_map.get(f"user_{u['id']}")
                group_can_view = any([perm_map.get(f"group_{gid}", {}).get('can_view') for gid in user_gids])
                group_can_download = any([perm_map.get(f"group_{gid}", {}).get('can_download') for gid in user_gids])
                result.append({
                    "subject_id": u['id'], "subject_type": "user", "name": u['name'], "email": u['email'],
                    "can_view": (direct_p and direct_p['can_view']) or False,
                    "can_download": (direct_p and direct_p['can_download']) or False,
                    "inherited_view": group_can_view, "inherited_download": group_can_download
                })
            for g in groups:
                gp = perm_map.get(f"group_{g['id']}")
                result.append({
                    "subject_id": g['id'], "subject_type": "group", "name": g['name'],
                    "can_view": (gp and gp['can_view']) or False, "can_download": (gp and gp['can_download']) or False
                })
            return jsonify(result)
    finally: conn.close()

@admin_bp.route('/api/permissions/<int:cid>', methods=['POST'])
@admin_required
def update_file_permissions(cid):
    perms = request.json 
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM contract_permissions WHERE contract_id = %s", (cid,))
            if perms:
                vals = [(cid, p.get('subject_id'), p.get('subject_type'), p.get('can_view', 0), p.get('can_download', 0)) for p in perms]
                cursor.executemany("INSERT INTO contract_permissions (contract_id, subject_id, subject_type, can_view, can_download) VALUES (%s, %s, %s, %s, %s)", vals)
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@admin_bp.route('/api/permissions/folder/<int:folder_id>', methods=['GET'])
@admin_required
def get_folder_permissions(folder_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, name, email FROM users WHERE role != 'admin'")
            users = cursor.fetchall()
            cursor.execute("SELECT * FROM folder_permissions WHERE folder_id = %s", (folder_id,))
            perms = cursor.fetchall()
            perm_map = {f"{p['subject_type']}_{p['subject_id']}": p for p in perms}
            cursor.execute("SELECT id, name FROM user_groups")
            groups = cursor.fetchall()
            result = []
            for u in users:
                user_gids = get_user_group_ids(cursor, u['id'])
                direct_p = perm_map.get(f"user_{u['id']}")
                group_can_view = any([perm_map.get(f"group_{gid}", {}).get('can_view') for gid in user_gids])
                group_can_download = any([perm_map.get(f"group_{gid}", {}).get('can_download') for gid in user_gids])
                result.append({
                    "subject_id": u['id'], "subject_type": "user", "name": u['name'], "email": u['email'],
                    "can_view": (direct_p and direct_p['can_view']) or False,
                    "can_download": (direct_p and direct_p['can_download']) or False,
                    "inherited_view": group_can_view, "inherited_download": group_can_download
                })
            for g in groups:
                gp = perm_map.get(f"group_{g['id']}")
                result.append({
                    "subject_id": g['id'], "subject_type": "group", "name": g['name'],
                    "can_view": (gp and gp['can_view']) or False, "can_download": (gp and gp['can_download']) or False
                })
            return jsonify(result)
    finally: conn.close()

@admin_bp.route('/api/permissions/folder/<int:folder_id>', methods=['POST'])
@admin_required
def update_folder_permissions(folder_id):
    perms = request.json 
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM folder_permissions WHERE folder_id = %s", (folder_id,))
            if perms:
                vals = [(folder_id, p.get('subject_id'), p.get('subject_type'), p.get('can_view', 0), p.get('can_download', 0)) for p in perms]
                cursor.executemany("INSERT INTO folder_permissions (folder_id, subject_id, subject_type, can_view, can_download) VALUES (%s, %s, %s, %s, %s)", vals)
            
            all_file_ids = get_all_sub_file_ids(cursor, folder_id)
            if all_file_ids:
                fmt = ','.join(['%s'] * len(all_file_ids))
                cursor.execute(f"DELETE FROM contract_permissions WHERE contract_id IN ({fmt})", tuple(all_file_ids))
                for p in perms:
                    _propagate_folder_permissions(cursor, folder_id, p.get('subject_id'), p.get('subject_type'), p.get('can_view', 0), p.get('can_download', 0))
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@admin_bp.route('/api/admin/users_with_groups', methods=['GET'])
@admin_required
def get_users_with_groups():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, name, email, feishu_open_id, is_active, IF(mfa_secret IS NOT NULL, 1, 0) as mfa_enabled FROM users WHERE role != 'admin'")
            users = cursor.fetchall()
            for u in users:
                u['group_ids'] = get_user_group_ids(cursor, u['id'])
            return jsonify(users)
    finally: conn.close()

@admin_bp.route('/api/admin/update_user_groups', methods=['POST'])
@admin_required
def update_user_groups():
    data = request.json
    user_id = data.get('user_id')
    group_ids = data.get('group_ids', [])
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM group_members WHERE user_id = %s", (user_id,))
            if group_ids:
                vals = [(gid, user_id) for gid in group_ids]
                cursor.executemany("INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)", vals)
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@admin_bp.route('/api/admin/delete_group/<int:gid>', methods=['DELETE'])
@admin_required
def delete_group(gid):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT name FROM user_groups WHERE id=%s", (gid,))
            g = cursor.fetchone()
            if g['name'] in ['默认组', '管理组']: return jsonify({"error": "Cannot delete system groups"}), 400
            cursor.execute("DELETE FROM group_members WHERE group_id=%s", (gid,))
            cursor.execute("DELETE FROM folder_permissions WHERE subject_id=%s AND subject_type='group'", (gid,))
            cursor.execute("DELETE FROM contract_permissions WHERE subject_id=%s AND subject_type='group'", (gid,))
            cursor.execute("DELETE FROM user_groups WHERE id=%s", (gid,))
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@admin_bp.route('/api/admin/toggle_user_status', methods=['POST'])
@admin_required
def toggle_user_status():
    uid = request.json.get('user_id')
    status = request.json.get('status') 
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE users SET is_active=%s WHERE id=%s", (1 if status else 0, uid))
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@admin_bp.route('/api/admin/create_group', methods=['POST'])
@admin_required
def create_group():
    name = request.json.get('name')
    if not name: return jsonify({"error": "Missing name"}), 400
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO user_groups (name) VALUES (%s)", (name,))
            conn.commit()
            return jsonify({"success": True})
    except: return jsonify({"error": "组名已存在"}), 400
    finally: conn.close()

@admin_bp.route('/api/groups', methods=['GET'])
@admin_required
def get_groups():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, name FROM user_groups")
            return jsonify(cursor.fetchall())
    finally: conn.close()

@admin_bp.route('/api/users_list', methods=['GET'])
@admin_required
def get_users_list():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, name, email, role FROM users WHERE role != 'admin'")
            return jsonify(cursor.fetchall())
    finally: conn.close()