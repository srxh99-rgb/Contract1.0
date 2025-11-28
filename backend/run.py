from app import create_app

app = create_app()

if __name__ == '__main__':
    # 生产环境建议使用 gunicorn 运行
    app.run(host='127.0.0.1', port=5000, debug=False)