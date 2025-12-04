1、修改\backend\app\config.py中的数据库链接账户密码
2、修改\frontend\.env中的飞书APPID，和frontend\src\api\client.ts中的飞书APPID
3、在frontend前端目录下执行 npm install，再执行npm run build 进行编译得到/dist目录
4、在backend目录下执行pip install -r requirements.txt
5、运行后端python run.py
6、使用nginx代理5173端口配置实例
<!-- 
server {
    listen 443 ssl;
    server_name xxx.xxx.com;

    ssl_certificate /etc/nginx/ssl/xxx.crt;
    ssl_certificate_key /etc/nginx/ssl/xxx.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE+AESGCM:DHE+AESGCM:AES256+EECDH:AES256+EDH;
    ssl_prefer_server_ciphers off;

    # Serve static files from the built dist folder
    location / {
        root /usr/src/Contract1.0-main/frontend/dist;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, immutable" always;
    }

    # Proxy all /api requests to backend (Flask/FastAPI/etc.)
    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        client_max_body_size 50M;
    }
}
 -->