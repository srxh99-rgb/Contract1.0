import logging
import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
import pymysql
from .extensions import socketio


from .config import Config
from .extensions import limiter
from .db import init_db

# 引入路由蓝图
from .routes.auth import auth_bp
from .routes.admin import admin_bp
from .routes.file_ops import file_bp
from .routes.audit import audit_bp

def configure_logging():
    """
    对应 server.py 中 # 配置日志 (北京时间) 部分
    """
    def beijing_converter(*args):
        return (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).timetuple()

    logging.Formatter.converter = beijing_converter
    logging.basicConfig(
        level=logging.INFO, 
        format='%(asctime)s - %(levelname)s - %(message)s', 
        handlers=[logging.FileHandler("app.log", encoding='utf-8'), logging.StreamHandler()]
    )
    # 获取 logger 实例
    return logging.getLogger(__name__)

logger = configure_logging()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # 初始化插件
    CORS(app)
    limiter.init_app(app)

    # 注册蓝图 (将拆分的路由挂载到主程序)
    socketio.init_app(app, cors_allowed_origins="*")
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(file_bp)
    app.register_blueprint(audit_bp)

    # 错误处理 (对应 server.py 的 handle_exception)
    @app.errorhandler(Exception)
    def handle_exception(e):
        if isinstance(e, HTTPException): return e
        logger.error(f"Unhandled Exception: {e}")
        if isinstance(e, pymysql.MySQLError): return jsonify({"error": "Database operation failed"}), 500
        return jsonify({"error": "Internal Server Error"}), 500

    # 安全头 (对应 server.py 的 add_security_headers)
    @app.after_request
    def add_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
        return response

    # 尝试初始化数据库
    with app.app_context():
        try: 
            init_db()
        except Exception as e: 
            logger.error(f"DB Init Failed: {e}")

    return app