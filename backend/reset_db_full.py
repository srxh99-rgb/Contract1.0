# backend/reset_db_full.py
import pymysql
import os
from app.config import Config

def reset_database():
    print("⚠️  正在连接数据库...")
    conn = pymysql.connect(
        host=Config.DB_HOST,
        user=Config.DB_USER,
        password=Config.DB_PASS,
        cursorclass=pymysql.cursors.DictCursor
    )
    
    db_name = Config.DB_NAME
    
    try:
        with conn.cursor() as cursor:
            # 1. 强制删除数据库（如果有）
            print(f"🔥 正在删除数据库: {db_name} ...")
            cursor.execute(f"DROP DATABASE IF EXISTS {db_name}")
            
            # 2. 重新创建数据库
            print(f"✨ 正在重新创建数据库: {db_name} ...")
            cursor.execute(f"CREATE DATABASE {db_name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            cursor.execute(f"USE {db_name}")
            
            # 3. 创建所有表
            print("🏗️  正在重建表结构...")
            tables = [
                "users (id INT AUTO_INCREMENT PRIMARY KEY, feishu_open_id VARCHAR(255), username VARCHAR(100), password VARCHAR(255), name VARCHAR(100), email VARCHAR(255), role VARCHAR(20) DEFAULT 'user', is_active BOOLEAN DEFAULT TRUE, failed_attempts INT DEFAULT 0, lockout_until TIMESTAMP NULL, mfa_secret VARCHAR(32) DEFAULT NULL, force_change_password BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
                "user_groups (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
                "group_members (group_id INT, user_id INT, PRIMARY KEY (group_id, user_id))",
                "folders (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, parent_id INT DEFAULT 0, creator_id INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
                "contracts (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, file_path VARCHAR(500) NOT NULL, file_type VARCHAR(50), security_level VARCHAR(50), file_size VARCHAR(50), uploader_id INT, folder_id INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
                "folder_permissions (id INT AUTO_INCREMENT PRIMARY KEY, folder_id INT NOT NULL, subject_id INT NOT NULL, subject_type ENUM('user', 'group') NOT NULL, can_view BOOLEAN DEFAULT FALSE, can_download BOOLEAN DEFAULT FALSE, UNIQUE KEY unique_perm (folder_id, subject_id, subject_type))",
                "contract_permissions (id INT AUTO_INCREMENT PRIMARY KEY, contract_id INT NOT NULL, subject_id INT NOT NULL, subject_type ENUM('user', 'group') DEFAULT 'user', can_view BOOLEAN DEFAULT FALSE, can_download BOOLEAN DEFAULT FALSE, UNIQUE KEY unique_perm (contract_id, subject_id, subject_type))",
                "audit_logs (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, contract_id INT, action_type VARCHAR(50), trace_id VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
            ]
            
            for t in tables:
                cursor.execute(f"CREATE TABLE {t}")
            
            # 添加索引
            cursor.execute("CREATE UNIQUE INDEX unique_name ON user_groups(name)")

            # 4. 初始化默认管理员 (强制修改密码状态)
            print("👤 初始化默认管理员 (admin/admin)...")
            # 注意：force_change_password=1 确保首次登录触发修改密码弹窗
            cursor.execute("INSERT INTO users (username, password, name, role, force_change_password) VALUES ('admin', 'admin', '系统管理员', 'admin', 1)")
            admin_id = cursor.lastrowid
            
            # 5. 初始化用户组
            print("👥 初始化用户组...")
            cursor.execute("INSERT INTO user_groups (name) VALUES ('默认组')")
            cursor.execute("INSERT INTO user_groups (name) VALUES ('管理组')")
            
            # 将 admin 加入管理组
            cursor.execute("SELECT id FROM user_groups WHERE name='管理组'")
            group_res = cursor.fetchone()
            if group_res:
                cursor.execute("INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)", (group_res['id'], admin_id))

        conn.commit()
        print("\n✅ 数据库重置成功！")
        print("➡️  账号: admin")
        print("➡️  密码: admin")
        print("💡 登录后将自动触发【修改密码 + MFA绑定】流程。")
        
    except Exception as e:
        print(f"\n❌ 发生错误: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    reset_database()