# backend/app/routes/file_ops.py
import os
import uuid
import time
from flask import Blueprint, jsonify, request, send_file, current_app
from werkzeug.utils import secure_filename

from app.db import get_db_connection
from app.decorators import token_required, admin_required
from app.utils.common import get_beijing_time, calculate_file_hash
from app.utils.watermark import WatermarkEngine
from app.utils.db_helpers import get_user_group_ids, get_all_sub_file_ids

file_bp = Blueprint('file_ops', __name__)

def _copy_parent_permissions(cursor, parent_id, new_folder_id):
    """复制父文件夹的权限到新文件夹"""
    if parent_id == 0: return 
    cursor.execute("SELECT subject_id, subject_type, can_view, can_download FROM folder_permissions WHERE folder_id = %s", (parent_id,))
    parent_perms = cursor.fetchall()
    if parent_perms:
        values = []
        for p in parent_perms:
            values.append((new_folder_id, p['subject_id'], p['subject_type'], p['can_view'], p['can_download']))
        stmt = "INSERT INTO folder_permissions (folder_id, subject_id, subject_type, can_view, can_download) VALUES (%s, %s, %s, %s, %s)"
        cursor.executemany(stmt, values)

def _propagate_folder_permissions(cursor, folder_id, subject_id, subject_type, can_view, can_download):
    """(在admin中也会用到) 将文件夹权限传播给子文件"""
    file_ids = get_all_sub_file_ids(cursor, folder_id)
    if not file_ids: return
    values = []
    for fid in file_ids:
        values.append((fid, subject_id, subject_type, 1 if can_view else 0, 1 if can_download else 0))
    if values:
        stmt = """
            INSERT INTO contract_permissions (contract_id, subject_id, subject_type, can_view, can_download) 
            VALUES (%s, %s, %s, %s, %s) 
            ON DUPLICATE KEY UPDATE can_view=VALUES(can_view), can_download=VALUES(can_download)
        """
        cursor.executemany(stmt, values)

def ensure_folder_path(cursor, root_folder_id, relative_path, creator_id):
    """处理上传时的相对路径，自动创建文件夹"""
    if not relative_path or '/' not in relative_path: return root_folder_id
    safe_path = relative_path.replace('..', '').strip('/')
    parts = safe_path.split('/')[:-1] 
    
    current_parent_id = root_folder_id
    for part in parts:
        if not part: continue
        parent_id_for_new = current_parent_id
        cursor.execute("SELECT id FROM folders WHERE name=%s AND parent_id=%s", (part, current_parent_id))
        result = cursor.fetchone()
        if result: 
            current_parent_id = result['id']
        else:
            cursor.execute("INSERT INTO folders (name, parent_id, creator_id, created_at) VALUES (%s, %s, %s, %s)", (part, current_parent_id, creator_id, get_beijing_time()))
            current_parent_id = cursor.lastrowid
            _copy_parent_permissions(cursor, parent_id_for_new, current_parent_id)
    return current_parent_id

def get_user_accessible_folder_ids(cursor, user_id):
    """计算用户有权限访问的所有文件夹ID"""
    group_ids = get_user_group_ids(cursor, user_id) + [-1]
    
    # 1. 包含文件的文件夹
    sql_files = """
        SELECT DISTINCT c.folder_id FROM contracts c
        LEFT JOIN contract_permissions cp ON c.id = cp.contract_id
        WHERE c.uploader_id = %s
           OR (cp.subject_type='user' AND cp.subject_id=%s AND cp.can_view=1)
           OR (cp.subject_type='group' AND cp.subject_id IN %s AND cp.can_view=1)
    """
    cursor.execute(sql_files, (user_id, user_id, group_ids))
    file_parent_ids = {row['folder_id'] for row in cursor.fetchall()}
    
    # 2. 直接授权的文件夹
    sql_folders = """
        SELECT DISTINCT f.id FROM folders f
        LEFT JOIN folder_permissions fp ON f.id = fp.folder_id
        WHERE f.creator_id = %s
           OR (fp.subject_type='user' AND fp.subject_id=%s AND fp.can_view=1)
           OR (fp.subject_type='group' AND fp.subject_id IN %s AND fp.can_view=1)
    """
    cursor.execute(sql_folders, (user_id, user_id, group_ids))
    direct_folder_ids = {row['id'] for row in cursor.fetchall()}
    
    seed_ids = file_parent_ids.union(direct_folder_ids)
    if not seed_ids: return []

    # 3. 向上追溯所有父级
    cursor.execute("SELECT id, parent_id FROM folders")
    all_folders = cursor.fetchall()
    parent_map = {f['id']: f['parent_id'] for f in all_folders}
    
    visible_ids = set()
    for fid in seed_ids:
        curr = fid
        while curr != 0 and curr in parent_map:
            if curr in visible_ids: break 
            visible_ids.add(curr)
            curr = parent_map[curr]
    return list(visible_ids)

def delete_folder_recursive(cursor, folder_id):
    """递归删除文件夹"""
    cursor.execute("SELECT file_path FROM contracts WHERE folder_id=%s", (folder_id,))
    files = cursor.fetchall()
    for f in files:
        if os.path.exists(f['file_path']):
            try: os.remove(f['file_path'])
            except: pass
    cursor.execute("DELETE FROM contracts WHERE folder_id=%s", (folder_id,))
    cursor.execute("DELETE FROM folder_permissions WHERE folder_id=%s", (folder_id,))
    cursor.execute("DELETE FROM contract_permissions WHERE contract_id IN (SELECT id FROM contracts WHERE folder_id=%s)", (folder_id,))
    cursor.execute("SELECT id FROM folders WHERE parent_id=%s", (folder_id,))
    subfolders = cursor.fetchall()
    for sub in subfolders: delete_folder_recursive(cursor, sub['id'])
    cursor.execute("DELETE FROM folders WHERE id=%s", (folder_id,))

@file_bp.route('/api/files/check_existence', methods=['POST'])
@token_required
def check_file_existence():
    data = request.json
    folder_id = data.get('folder_id', 0)
    filenames = data.get('filenames', [])
    if not filenames: return jsonify([])
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            fmt = ','.join(['%s'] * len(filenames))
            cursor.execute(f"SELECT title FROM contracts WHERE folder_id = %s AND title IN ({fmt})", (folder_id, *filenames))
            existing = [row['title'] for row in cursor.fetchall()]
            return jsonify(existing)
    finally: conn.close()

@file_bp.route('/api/upload', methods=['POST'])
@token_required
def upload_file():
    # 检查权限：当前仅允许 Admin 上传，如需开放可调整此处
    if request.current_user_role != 'admin': return jsonify({"error": "Permission denied"}), 403
    file = request.files.get('file')
    user_id = request.current_user_id
    folder_id = request.form.get('folder_id', 0)
    level = request.form.get('level', '内部')
    relative_path = request.form.get('relative_path', '')
    conflict_mode = request.form.get('conflict_mode', 'rename') 
    
    UPLOAD_FOLDER = current_app.config['UPLOAD_FOLDER']
    ALLOWED_EXTENSIONS = current_app.config['ALLOWED_EXTENSIONS']

    if file:
        original_filename = os.path.basename(file.filename)
        if len(original_filename) > 255: return jsonify({"error": "Filename too long"}), 400
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
        if ext not in ALLOWED_EXTENSIONS: return jsonify({"error": "不支持的格式"}), 400
        save_name = f"{uuid.uuid4().hex}.{ext}"
        save_path = os.path.join(UPLOAD_FOLDER, save_name)
        file.save(save_path)
        size = f"{os.path.getsize(save_path)/1024/1024:.2f} MB"
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                final_folder_id = ensure_folder_path(cursor, folder_id, relative_path, user_id)
                cursor.execute("SELECT id, file_path FROM contracts WHERE folder_id=%s AND title=%s", (final_folder_id, original_filename))
                existing = cursor.fetchone()
                new_file_id = 0
                action_type = "UPLOAD"
                
                if existing:
                    if conflict_mode == 'replace':
                        old_path = existing['file_path']
                        if os.path.exists(old_path): 
                            try: os.remove(old_path)
                            except: pass
                        cursor.execute("UPDATE contracts SET file_path=%s, file_size=%s, created_at=%s WHERE id=%s", (save_path, size, get_beijing_time(), existing['id']))
                        new_file_id = existing['id']
                        action_type = "UPLOAD_REPLACE"
                    else: 
                        name_part = original_filename.rsplit('.', 1)[0]
                        new_filename = f"{name_part} (1).{ext}" 
                        sql = "INSERT INTO contracts (title, file_path, file_type, security_level, file_size, uploader_id, folder_id, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
                        cursor.execute(sql, (new_filename, save_path, ext, level, size, user_id, final_folder_id, get_beijing_time()))
                        new_file_id = cursor.lastrowid
                else:
                    sql = "INSERT INTO contracts (title, file_path, file_type, security_level, file_size, uploader_id, folder_id, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
                    cursor.execute(sql, (original_filename, save_path, ext, level, size, user_id, final_folder_id, get_beijing_time()))
                    new_file_id = cursor.lastrowid
                
                # 继承父文件夹权限
                cursor.execute("SELECT * FROM folder_permissions WHERE folder_id = %s", (final_folder_id,))
                parent_perms = cursor.fetchall()
                perm_values = []
                for pp in parent_perms:
                    perm_values.append((new_file_id, pp['subject_id'], pp['subject_type'], pp['can_view'], pp['can_download']))
                if perm_values:
                    stmt = "INSERT IGNORE INTO contract_permissions (contract_id, subject_id, subject_type, can_view, can_download) VALUES (%s, %s, %s, %s, %s)"
                    cursor.executemany(stmt, perm_values)
                trace_id = f"UPLOAD_{user_id}_{uuid.uuid4().hex[:8]}"
                cursor.execute(
                    "INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, %s, 'UPLOAD', %s, %s)",
                    (user_id, new_file_id, trace_id, get_beijing_time())
                )
                
                conn.commit()
        finally: conn.close()
        return jsonify({"success": True})
    return jsonify({"error": "No file"}), 400

@file_bp.route('/api/contracts', methods=['GET'])
@token_required
def get_contracts():
    folder_id = request.args.get('folder_id', 0)
    user_id = request.current_user_id
    role = request.current_user_role
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if role == 'admin':
                sql = "SELECT c.*, u.name as uploader, 1 as can_view, 1 as can_download FROM contracts c LEFT JOIN users u ON c.uploader_id = u.id WHERE c.folder_id = %s ORDER BY c.created_at DESC"
                cursor.execute(sql, (folder_id,))
            else:
                group_ids = get_user_group_ids(cursor, user_id) + [-1]
                sql = """
                    SELECT c.*, u.name as uploader, 
                           MAX(CASE 
                               WHEN cp.subject_type='user' AND cp.subject_id=%s THEN cp.can_view
                               WHEN cp.subject_type='group' AND cp.subject_id IN %s THEN cp.can_view
                               ELSE 0 END) as can_view,
                           MAX(CASE 
                               WHEN cp.subject_type='user' AND cp.subject_id=%s THEN cp.can_download
                               WHEN cp.subject_type='group' AND cp.subject_id IN %s THEN cp.can_download
                               ELSE 0 END) as can_download
                    FROM contracts c 
                    LEFT JOIN users u ON c.uploader_id = u.id 
                    LEFT JOIN contract_permissions cp ON c.id = cp.contract_id
                    WHERE c.folder_id = %s 
                    GROUP BY c.id
                    HAVING (c.uploader_id = %s OR can_view = 1)
                    ORDER BY c.created_at DESC
                """
                cursor.execute(sql, (user_id, group_ids, user_id, group_ids, folder_id, user_id))
            return jsonify(cursor.fetchall())
    finally: conn.close()

@file_bp.route('/api/download/<int:cid>', methods=['GET', 'POST'])
@token_required
def secure_download(cid):
    if request.method == 'OPTIONS': return jsonify({'status': 'ok'})
    is_preview = request.method == 'GET'
    user_id = request.current_user_id
    role = request.current_user_role
    user_info = {'id': user_id, 'name': request.current_user_name, 'email': request.current_user_email, 'role': role}
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM contracts WHERE id=%s", (cid,))
            contract = cursor.fetchone()
            if not contract or not os.path.exists(contract['file_path']): 
                return jsonify({"error": "File not found"}), 404
            
            # 权限检查
            if role != 'admin' and str(contract['uploader_id']) != str(user_id):
                group_ids = get_user_group_ids(cursor, user_id) + [-1]
                cursor.execute("""
                    SELECT MAX(can_view) as v, MAX(can_download) as d 
                    FROM contract_permissions 
                    WHERE contract_id=%s AND (
                        (subject_type='user' AND subject_id=%s) OR 
                        (subject_type='group' AND subject_id IN %s)
                    )
                """, (cid, user_id, group_ids))
                perm = cursor.fetchone()
                if is_preview:
                    if not perm or not perm['v']: return "无预览权限", 403
                else:
                    if not perm or not perm['d']: return jsonify({"error": "无下载权限"}), 403
            
            file_hash = calculate_file_hash(contract['file_path'])
            trace_id = f"TRACE_{user_id}_{int(time.time())}_{file_hash}"
            action = 'PREVIEW' if is_preview else 'DOWNLOAD'
            
            # 🟢 写入审计日志
            cursor.execute("INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, %s, %s, %s, %s)", (user_id, cid, action, trace_id, get_beijing_time()))
            conn.commit()
            
            file_type = contract.get('file_type', 'pdf').lower()
            
            # 原文件返回逻辑
            if role == 'admin' or (not is_preview and file_type in ['doc', 'docx', 'xls', 'xlsx']):
                if not is_preview or file_type in ['pdf', 'png', 'jpg', 'jpeg']:
                    return send_file(contract['file_path'], as_attachment=(not is_preview), download_name=contract['title'], mimetype='application/pdf' if file_type == 'pdf' else None)
                else:
                    try:
                        out_stream = WatermarkEngine.process_file(contract['file_path'], file_type, user_info, trace_id, add_watermark=False)
                        return send_file(out_stream, as_attachment=False, mimetype='application/pdf')
                    except: return "预览生成失败", 500
            
            # 加水印返回逻辑
            try:
                out_stream = WatermarkEngine.process_file(contract['file_path'], file_type, user_info, trace_id, add_watermark=True)
                return send_file(out_stream, as_attachment=(not is_preview), download_name=f"SECURED_{contract['title']}.pdf", mimetype='application/pdf')
            except: return "文件处理失败", 500
    finally: conn.close()

@file_bp.route('/api/folders', methods=['GET', 'POST'])
@token_required
def manage_folders():
    parent_id = request.args.get('parent_id', 0)
    user_id = request.current_user_id
    role = request.current_user_role
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if request.method == 'POST':
                if role != 'admin': return jsonify({"error": "Permission denied"}), 403
                req_name = request.json.get('name')
                req_parent_id = int(request.json.get('parent_id', 0))
                
                cursor.execute("INSERT INTO folders (name, parent_id, creator_id, created_at) VALUES (%s, %s, %s, %s)", (req_name, req_parent_id, user_id, get_beijing_time()))
                new_folder_id = cursor.lastrowid
                _copy_parent_permissions(cursor, req_parent_id, new_folder_id)
                
                # 🟢 中文日志
                trace_info = f"新建文件夹: {req_name}"
                cursor.execute("INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, 0, 'CREATE_FOLDER', %s, %s)", (user_id, trace_info, get_beijing_time()))
                
                conn.commit()
                return jsonify({"success": True})
            else:
                # GET 逻辑保持不变...
                if role == 'admin':
                    cursor.execute("SELECT * FROM folders WHERE parent_id = %s ORDER BY created_at ASC", (parent_id,))
                else:
                    visible_ids = get_user_accessible_folder_ids(cursor, user_id)
                    if not visible_ids: return jsonify([])
                    fmt = ','.join(['%s'] * len(visible_ids))
                    sql = f"SELECT * FROM folders WHERE parent_id = %s AND id IN ({fmt}) ORDER BY created_at ASC"
                    cursor.execute(sql, (parent_id, *visible_ids))
                return jsonify(cursor.fetchall())
    finally: conn.close()

@file_bp.route('/api/folders/<int:fid>', methods=['PUT', 'DELETE'])
@admin_required
def folder_ops(fid):
    conn = get_db_connection()
    user_id = request.current_user_id
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT name FROM folders WHERE id=%s", (fid,))
            folder = cursor.fetchone()
            folder_name = folder['name'] if folder else "Unknown"

            if request.method == 'PUT':
                new_name = request.json.get('name')
                cursor.execute("UPDATE folders SET name=%s WHERE id=%s", (new_name, fid))
                # 🟢 中文日志
                trace_info = f"重命名文件夹: {folder_name} -> {new_name}"
                cursor.execute("INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, 0, 'RENAME_FOLDER', %s, %s)", (user_id, trace_info, get_beijing_time()))
                
            elif request.method == 'DELETE':
                if fid == 0: return jsonify({"error": "Root locked"}), 400
                delete_folder_recursive(cursor, fid)
                # 🟢 中文日志
                trace_info = f"删除文件夹: {folder_name} (ID:{fid})"
                cursor.execute("INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, 0, 'DELETE_FOLDER', %s, %s)", (user_id, trace_info, get_beijing_time()))
                
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@file_bp.route('/api/delete_contract/<int:cid>', methods=['POST'])
@token_required
def delete_contract(cid):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 🟢 必须查出 title 才能记录日志
            cursor.execute("SELECT uploader_id, file_path, title FROM contracts WHERE id=%s", (cid,))
            row = cursor.fetchone()
            if not row: return jsonify({"error": "Not found"}), 404
            
            if request.current_user_role != 'admin' and str(row['uploader_id']) != str(request.current_user_id):
                return jsonify({"error": "Permission denied"}), 403
            
            if row and os.path.exists(row['file_path']):
                try: os.remove(row['file_path'])
                except: pass
            
            # 🟢 中文日志 (记录在 trace_id 中，因为 contract_id 即将被删)
            trace_info = f"删除文件: {row['title']}"
            cursor.execute(
                "INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, 0, 'DELETE', %s, %s)",
                (request.current_user_id, trace_info, get_beijing_time())
            )

            cursor.execute("DELETE FROM contracts WHERE id=%s", (cid,))
            cursor.execute("DELETE FROM contract_permissions WHERE contract_id=%s", (cid,))
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@file_bp.route('/api/contracts/<int:cid>', methods=['PUT'])
@admin_required
def rename_contract(cid):
    conn = get_db_connection()
    user_id = request.current_user_id
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT title FROM contracts WHERE id=%s", (cid,))
            old_row = cursor.fetchone()
            old_title = old_row['title'] if old_row else "Unknown"
            new_title = request.json.get('title')
            
            cursor.execute("UPDATE contracts SET title=%s WHERE id=%s", (new_title, cid))
            
            # 🟢 中文日志
            trace_info = f"文件重命名: {old_title} -> {new_title}"
            cursor.execute("INSERT INTO audit_logs (user_id, contract_id, action_type, trace_id, created_at) VALUES (%s, %s, 'RENAME_FILE', %s, %s)", (user_id, cid, trace_info, get_beijing_time()))
            
            conn.commit()
            return jsonify({"success": True})
    finally: conn.close()

@file_bp.route('/api/search', methods=['GET'])
@token_required
def search_resources():
    q = request.args.get('q', '').strip()
    if not q or len(q) > 50: return jsonify({'folders': [], 'files': []})
    user_id = request.current_user_id
    role = request.current_user_role
    search_term = f"%{q}%"
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if role == 'admin':
                cursor.execute("SELECT * FROM folders WHERE name LIKE %s", (search_term,))
                folders = cursor.fetchall()
                cursor.execute("SELECT c.*, u.name as uploader FROM contracts c LEFT JOIN users u ON c.uploader_id = u.id WHERE c.title LIKE %s", (search_term,))
                files = cursor.fetchall()
            else:
                group_ids = get_user_group_ids(cursor, user_id) + [-1]
                cursor.execute("""
                    SELECT DISTINCT c.*, u.name as uploader 
                    FROM contracts c
                    LEFT JOIN users u ON c.uploader_id = u.id
                    LEFT JOIN contract_permissions cp ON c.id = cp.contract_id
                    WHERE c.title LIKE %s 
                    AND (
                        c.uploader_id = %s 
                        OR (cp.subject_type='user' AND cp.subject_id=%s AND cp.can_view=1)
                        OR (cp.subject_type='group' AND cp.subject_id IN %s AND cp.can_view=1)
                    )
                """, (search_term, user_id, user_id, group_ids))
                files = cursor.fetchall()
                visible_ids = get_user_accessible_folder_ids(cursor, user_id)
                if visible_ids:
                    fmt = ','.join(['%s'] * len(visible_ids))
                    cursor.execute(f"SELECT * FROM folders WHERE name LIKE %s AND id IN ({fmt})", (search_term, *visible_ids))
                    folders = cursor.fetchall()
                else: folders = []
            return jsonify({'folders': folders, 'files': files})
    finally: conn.close()
