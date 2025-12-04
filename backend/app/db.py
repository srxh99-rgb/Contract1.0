import pymysql
from flask import current_app

def get_db_connection():
    return pymysql.connect(
        host=current_app.config['DB_HOST'],
        user=current_app.config['DB_USER'],
        password=current_app.config['DB_PASS'],
        database=current_app.config['DB_NAME'],
        cursorclass=pymysql.cursors.DictCursor
    )

def init_db():
    host = current_app.config['DB_HOST']
    user = current_app.config['DB_USER']
    password = current_app.config['DB_PASS']
    db_name = current_app.config['DB_NAME']

    # 连接 MySQL (不指定数据库，因为可能还没创建)
    conn = pymysql.connect(host=host, user=user, password=password)
    try:
        with conn.cursor() as cursor:
            # 创建数据库
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {db_name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            cursor.execute(f"USE {db_name}")
            
            # 定义表结构
            # 🟢 关键：请注意 audit_logs 这一行末尾必须有逗号
            tables = [
                "users (id INT AUTO_INCREMENT PRIMARY KEY, feishu_open_id VARCHAR(255), username VARCHAR(100), password VARCHAR(255), name VARCHAR(100), email VARCHAR(255), role VARCHAR(20) DEFAULT 'user', is_active BOOLEAN DEFAULT TRUE, failed_attempts INT DEFAULT 0, lockout_until TIMESTAMP NULL, mfa_secret VARCHAR(32) DEFAULT NULL, force_change_password BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
                "user_groups (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
                "group_members (group_id INT, user_id INT, PRIMARY KEY (group_id, user_id))",
                "folders (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, parent_id INT DEFAULT 0, creator_id INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
                "contracts (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, file_path VARCHAR(500) NOT NULL, file_type VARCHAR(50), security_level VARCHAR(50), file_size VARCHAR(50), uploader_id INT, folder_id INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
                "folder_permissions (id INT AUTO_INCREMENT PRIMARY KEY, folder_id INT NOT NULL, subject_id INT NOT NULL, subject_type ENUM('user', 'group') NOT NULL, can_view BOOLEAN DEFAULT FALSE, can_download BOOLEAN DEFAULT FALSE, UNIQUE KEY unique_perm (folder_id, subject_id, subject_type))",
                "contract_permissions (id INT AUTO_INCREMENT PRIMARY KEY, contract_id INT NOT NULL, subject_id INT NOT NULL, subject_type ENUM('user', 'group') DEFAULT 'user', can_view BOOLEAN DEFAULT FALSE, can_download BOOLEAN DEFAULT FALSE, UNIQUE KEY unique_perm (contract_id, subject_id, subject_type))",
                "audit_logs (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, contract_id INT, action_type VARCHAR(50), trace_id VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
                "system_settings (id INT AUTO_INCREMENT PRIMARY KEY, `key` VARCHAR(50) NOT NULL UNIQUE, `value` TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)"
            ]
            
            for t in tables: 
                cursor.execute(f"CREATE TABLE IF NOT EXISTS {t}")
            
            cursor.execute("SELECT * FROM system_settings WHERE `key`='backup_schedule'")
            if not cursor.fetchone():
                # 默认每天凌晨 2 点备份
                default_config = '{"type": "daily", "time": "02:00"}'
                cursor.execute("INSERT INTO system_settings (`key`, `value`) VALUES ('backup_schedule', %s)", (default_config,))
            
            # 补丁与初始化
            try: cursor.execute("CREATE UNIQUE INDEX unique_name ON user_groups(name)")
            except: pass
            
            cursor.execute("SHOW COLUMNS FROM users LIKE 'mfa_secret'")
            if not cursor.fetchone(): cursor.execute("ALTER TABLE users ADD COLUMN mfa_secret VARCHAR(32) DEFAULT NULL")
            
            cursor.execute("SHOW COLUMNS FROM users LIKE 'force_change_password'")
            if not cursor.fetchone(): cursor.execute("ALTER TABLE users ADD COLUMN force_change_password BOOLEAN DEFAULT FALSE")

            # 初始化管理员
            cursor.execute("SELECT * FROM users WHERE username='admin'")
            if not cursor.fetchone():
                cursor.execute("INSERT INTO users (username, password, name, role, is_active, force_change_password) VALUES ('admin', 'admin', '系统管理员', 'admin', 1, 1)")
            
            # 初始化组
            for g_name in ['默认组', '管理组']:
                cursor.execute("INSERT IGNORE INTO user_groups (name) VALUES (%s)", (g_name,))
                
        conn.commit()
    finally: conn.close()
