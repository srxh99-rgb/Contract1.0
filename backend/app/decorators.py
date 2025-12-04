from functools import wraps
from flask import request, jsonify, current_app
import jwt

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS': return f(*args, **kwargs)
        token = None
        if 'Authorization' in request.headers and request.headers['Authorization'].startswith('Bearer '):
            token = request.headers['Authorization'].split(" ")[1]
        if not token: return jsonify({'error': 'Token is missing!'}), 401
        try:
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
            request.current_user_id = data['user_id']
            request.current_user_role = data.get('role')
            request.current_user_name = data.get('name', 'Unknown')
            request.current_user_email = data.get('email', '')
            request.current_username = data.get('username', '') 
        except: return jsonify({'error': 'Token is invalid or expired!'}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS': return f(*args, **kwargs)
        if request.current_user_role != 'admin': return jsonify({'error': 'Admin privilege required'}), 403
        return f(*args, **kwargs)
    return decorated

def super_admin_required(f):
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS': return f(*args, **kwargs)
        if request.current_username != 'admin': 
            return jsonify({'error': 'Super Admin privilege required'}), 403
        return f(*args, **kwargs)
    return decorated