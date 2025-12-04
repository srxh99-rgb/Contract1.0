from app import create_app, socketio
from app.db import init_db
from app.scheduler import init_scheduler

app = create_app()

if __name__ == '__main__':
    # 生产环境建议使用 gunicorn 运行
    app.run(host='127.0.0.1', port=5000, debug=False)