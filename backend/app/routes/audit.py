import os
import uuid
from flask import Blueprint, jsonify, request, current_app
from werkzeug.utils import secure_filename

from app.db import get_db_connection
from app.decorators import admin_required
from app.utils.watermark import WatermarkEngine

audit_bp = Blueprint('audit', __name__)

@audit_bp.route('/api/verify', methods=['POST'])
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
            return jsonify({"success": True, "data": result})
        finally:
            if os.path.exists(temp_path): os.remove(temp_path)
    return jsonify({"error": "Upload failed"}), 500

@audit_bp.route('/api/logs', methods=['GET'])
@admin_required
def get_audit_logs():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "SELECT a.id, a.action_type, a.trace_id, a.created_at, u.name as user_name, u.email as user_email, c.title as file_name FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id LEFT JOIN contracts c ON a.contract_id = c.id ORDER BY a.created_at DESC LIMIT 200"
            cursor.execute(sql)
            return jsonify(cursor.fetchall())
    finally: conn.close()