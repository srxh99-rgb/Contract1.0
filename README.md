📄 合同管理系统（Contract Management System）
一个基于 Vue 3 + Flask 的合同管理平台，支持用户权限、文件上传、飞书登录等功能。

🚀 快速部署指南
1️⃣ 配置后端数据库连接
编辑后端配置文件，设置 MySQL 账号密码：

python
编辑
# backend/app/config.py

DB_HOST = os.getenv('DB_HOST', '127.0.0.1')

DB_USER = os.getenv('DB_USER', 'your_db_username')      # ← 修改此处

DB_PASS = os.getenv('DB_PASS', 'your_db_password')      # ← 修改此处

DB_NAME = 'contract_system'

💡 建议：生产环境通过环境变量传入敏感信息，避免硬编码。

2️⃣ 配置飞书 OAuth 应用
(1) 前端 .env 文件
env
编辑
# frontend/.env

VITE_FEISHU_APP_ID=cli_xxxxxxxx       # ← 替换为你的飞书 App ID

(2) 前端 API 客户端
ts
编辑
// frontend/src/api/client.ts

const APP_ID = 'cli_xxxxxxxx';        // ← 确保与 .env 一致

🔑 获取方式：登录 飞书开放平台 → 创建企业自建应用 → 获取 App ID 和 App Secret。

3️⃣ 构建前端项目
在 frontend/ 目录下执行：

bash 编辑

npm install          # 安装依赖

npm run build        # 编译生成 dist/ 目录

构建产物位于：frontend/dist/

4️⃣ 安装后端依赖
在 backend/ 目录下执行：

bash 编辑

pip install -r requirements.txt

5️⃣ 启动后端服务

bash 编辑

cd backend/
python run.py
默认运行于：http://127.0.0.1:5000

⚠️ 注意：此为开发服务器，仅用于测试。生产环境请使用 Gunicorn/uWSGI + Nginx。

6️⃣ Nginx 生产部署配置（HTTPS）
将以下配置放入 /etc/nginx/sites-enabled/your-site.conf：

nginx

编辑


server {

    listen 443 ssl;
	
    server_name your-domain.com;  # ← 替换为你的域名

    ssl_certificate /etc/nginx/ssl/your-cert.crt;
    ssl_certificate_key /etc/nginx/ssl/your-key.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE+AESGCM:DHE+AESGCM:AES256+EECDH:AES256+EDH;
    ssl_prefer_server_ciphers off;

    # 静态资源：前端页面
    location / {
        root /usr/src/Contract1.0-main/frontend/dist;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, immutable" always;
    }

    # API 请求：代理到后端
    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}
然后重载 Nginx：

bash
编辑

sudo nginx -t && sudo systemctl reload nginx

访问 https://your-domain.com 即可使用系统。


🛠️ 初始化数据库（可选）

首次部署需初始化数据库：

bash
编辑
cd backend/

python reset_db_full.py  # ⚠️ 会清空现有数据！

默认管理员账号：

用户名：admin

密码：admin（首次登录强制修改）

📁 项目结构
text
编辑
Contract1.0-main/

├── backend/            # Flask 后端

│   ├── app/            # 应用逻辑

│   ├── run.py          # 启动入口

│   └── requirements.txt

├── frontend/           # Vue 3 前端

│   ├── src/

│   ├── dist/           # 构建输出目录

│   └── .env

└── README.md

📌 注意事项

确保 MySQL 用户 'contract'@'127.0.0.1' 存在并拥有 contract_system 数据库权限。

飞书回调地址需配置为：https://your-domain.com

生产环境切勿使用 Flask 内置服务器，应搭配 Gunicorn 或 uWSGI。
