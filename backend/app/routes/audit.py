import os
import uuid
from flask import Blueprint, jsonify, request, current_app
from werkzeug.utils import secure_filename

from app.db import get_db_connection
from app.decorators import admin_required
from app.utils.watermark import WatermarkEngine

audit_bp = Blueprint('audit', __name__)

# 操作类型映射
ACTION_MAP = {
    'DOWNLOAD': '文件下载',
    'PREVIEW': '在线预览',
    'UPLOAD': '文件上传',
    'DELETE': '文件删除',
    'RENAME_FILE': '文件重命名',
    'CREATE_FOLDER': '新建文件夹',
    'RENAME_FOLDER': '文件夹重命名',
    'DELETE_FOLDER': '删除文件夹',
    'UPDATE_FILE_PERM': '修改文件权限',
    'UPDATE_FOLDER_PERM': '修改目录权限',
    'DOWNLOAD_BACKUP': '下载系统备份',
    'CREATE_ADMIN': '创建管理员',
    'DELETE_ADMIN': '删除管理员',
    'RESET_USER_PWD': '重置用户密码',
    'UPDATE_PROFILE': '更新个人资料',
    'ENABLE_USER': '启用用户账号',
    'DISABLE_USER': '禁用用户账号',
    'UNBIND_MFA': '解绑MFA',
    'CREATE_GROUP': '新建用户组',
    'DELETE_GROUP': '删除用户组',
    'UPDATE_GROUP': '重命名用户组',
    'UPDATE_USER_GROUP': '分配用户组',
    'UPDATE_SYS_CONFIG': '修改系统配置',
    'COMPLETE_SETUP': '初始化设置',
    'LOGIN_ADMIN': '管理员登录',
    'LOGIN_USER': '用户登录',
    'LOGIN_FEISHU': '飞书登录',
    'LOGIN_LOCKED': '登录被锁定',
    'LOGIN_FAILED': '密码错误',
    'LOGIN_MFA_FAILED': 'MFA验证失败',
    'LOGIN_MFA_SUCCESS': 'MFA验证成功'
}

@audit_bp.route('/api/audit/verify_watermark', methods=['POST'])
@admin_required
def verify_watermark():
    if 'file' not in request.files: return jsonify({"error": "No file"}), 400
    file = request.files['file']
    
    UPLOAD_FOLDER = current_app.config['UPLOAD_FOLDER']
    
    if file:
        fname = secure_filename(file.filename)
        temp_path = os.path.join(UPLOAD_FOLDER, f"verify_{uuid.uuid4().hex[:6]}_{fname}")
        file.save(temp_path)
        try:
            result = WatermarkEngine.extract_blind_watermark(temp_path)
            return jsonify(result)
        finally:
            if os.path.exists(temp_path): os.remove(temp_path)
    return jsonify({"error": "Upload failed"}), 500

@audit_bp.route('/api/audit/logs', methods=['GET'])
@admin_required
def get_audit_logs():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 🟢 修复1：将 c.title as file_name 改为 c.title as contract_title
            sql = """
                SELECT a.id, a.action_type, a.trace_id, a.created_at, 
                       u.name as user_name, u.email as user_email, 
                       c.title as contract_title 
                FROM audit_logs a 
                LEFT JOIN users u ON a.user_id = u.id 
                LEFT JOIN contracts c ON a.contract_id = c.id 
                ORDER BY a.created_at DESC LIMIT 200
            """
            cursor.execute(sql)
            logs = cursor.fetchall()
            
            for log in logs:
                # 翻译操作类型
                raw_action = log['action_type']
                log['action_type'] = ACTION_MAP.get(raw_action, raw_action)
                
                # 🟢 修复2：如果文件已被删除(contract_title为None)，尝试从trace_id显示信息
                if not log['contract_title']:
                    # 对于我们手动记录在 trace_id 里的操作（如删除、重命名），直接显示出来
                    if log['trace_id'] and ('TraceID' not in log['trace_id']) and ('TRACE_' not in log['trace_id']):
                         # 过滤掉乱码长的 TraceID，只显示可读的
                         log['contract_title'] = log['trace_id']
                    else:
                        log['contract_title'] = '已删除或未知对象'

            return jsonify(logs)
    finally: conn.close()
