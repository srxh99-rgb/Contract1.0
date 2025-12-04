import os
import sys
import pymysql
import json

# 1. 路径修复：确保能找到 'app' 模块
# 获取 backend 目录的绝对路径
current_dir = os.path.dirname(os.path.abspath(__file__))
# 将 backend 目录加入 sys.path
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# 2. 导入修复：尝试导入 Config 类
try:
    from app.config import Config
except ImportError as e:
    print(f"❌ Error importing app.config: {e}")
    print("Please run this script from the 'backend/' directory: python reset_db_full.py")
    sys.exit(1)

def reset_database():
    # 3. 配置修复：直接访问类属性，而不是使用 ['default']
    host = Config.DB_HOST
    user = Config.DB_USER
    password = Config.DB_PASS
    db_name = Config.DB_NAME

    print(f"Connecting to database server {host}...")
    
    try:
        # 连接到 MySQL 服务器（不指定数据库）
        conn = pymysql.connect(host=host, user=user, password=password)
        with conn.cursor() as cursor:
            # Drop old database
            print(f"Dropping database '{db_name}' if it exists...")
            cursor.execute(f"DROP DATABASE IF EXISTS {db_name}")
            
            # Create new database
            print(f"Creating database '{db_name}'...")
            cursor.execute(f"CREATE DATABASE {db_name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            cursor.execute(f"USE {db_name}")

            # Create tables
            print("Creating tables...")
            
            tables = [
                # Users table
                """CREATE TABLE users (
                    id INT AUTO_INCREMENT PRIMARY KEY, 
                    feishu_open_id VARCHAR(255), 
                    username VARCHAR(100), 
                    password VARCHAR(255), 
                    name VARCHAR(100), 
                    email VARCHAR(255), 
                    role VARCHAR(20) DEFAULT 'user', 
                    is_active BOOLEAN DEFAULT TRUE, 
                    failed_attempts INT DEFAULT 0, 
                    lockout_until TIMESTAMP NULL, 
                    mfa_secret VARCHAR(32) DEFAULT NULL, 
                    force_change_password BOOLEAN DEFAULT FALSE, 
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )""",
                # User Groups table
                """CREATE TABLE user_groups (
                    id INT AUTO_INCREMENT PRIMARY KEY, 
                    name VARCHAR(100) NOT NULL UNIQUE, 
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )""",
                # Group Members table
                """CREATE TABLE group_members (
                    group_id INT, 
                    user_id INT, 
                    PRIMARY KEY (group_id, user_id)
                )""",
                # Folders table
                """CREATE TABLE folders (
                    id INT AUTO_INCREMENT PRIMARY KEY, 
                    name VARCHAR(255) NOT NULL, 
                    parent_id INT DEFAULT 0, 
                    creator_id INT DEFAULT 0, 
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )""",
                # Contracts table
                """CREATE TABLE contracts (
                    id INT AUTO_INCREMENT PRIMARY KEY, 
                    title VARCHAR(255) NOT NULL, 
                    file_path VARCHAR(500) NOT NULL, 
                    file_type VARCHAR(50), 
                    security_level VARCHAR(50), 
                    file_size VARCHAR(50), 
                    uploader_id INT, 
                    folder_id INT DEFAULT 0, 
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )""",
                # Folder Permissions
                """CREATE TABLE folder_permissions (
                    id INT AUTO_INCREMENT PRIMARY KEY, 
                    folder_id INT NOT NULL, 
                    subject_id INT NOT NULL, 
                    subject_type ENUM('user', 'group') NOT NULL, 
                    can_view BOOLEAN DEFAULT FALSE, 
                    can_download BOOLEAN DEFAULT FALSE, 
                    UNIQUE KEY unique_perm (folder_id, subject_id, subject_type)
                )""",
                # Contract Permissions
                """CREATE TABLE contract_permissions (
                    id INT AUTO_INCREMENT PRIMARY KEY, 
                    contract_id INT NOT NULL, 
                    subject_id INT NOT NULL, 
                    subject_type ENUM('user', 'group') DEFAULT 'user', 
                    can_view BOOLEAN DEFAULT FALSE, 
                    can_download BOOLEAN DEFAULT FALSE, 
                    UNIQUE KEY unique_perm (contract_id, subject_id, subject_type)
                )""",
                # Audit Logs
                """CREATE TABLE audit_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY, 
                    user_id INT, 
                    contract_id INT, 
                    action_type VARCHAR(50), 
                    trace_id VARCHAR(255), 
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )""",
                # System Settings
                """CREATE TABLE system_settings (
                    id INT AUTO_INCREMENT PRIMARY KEY, 
                    `key` VARCHAR(50) NOT NULL UNIQUE, 
                    `value` TEXT, 
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )"""
            ]

            for sql in tables:
                cursor.execute(sql)

            # Initialize default data
            print("Initializing default data...")
            
            # (1) Create default admin (admin/admin)
            # 关键：这里显式设置了 force_change_password = 1，确保首次登录触发重置流程
            cursor.execute("INSERT INTO users (username, password, name, role, is_active, force_change_password) VALUES ('admin', 'admin', '系统管理员', 'admin', 1, 1)")
            admin_id = cursor.lastrowid
            print(f"  - Admin user created (ID: {admin_id})")

            # (2) Create default groups
            cursor.execute("INSERT INTO user_groups (name) VALUES ('默认组')")
            cursor.execute("INSERT INTO user_groups (name) VALUES ('管理组')")
            mgmt_group_id = cursor.lastrowid
            print("  - Default groups created")
            
            # (3) Add admin to management group
            cursor.execute(f"INSERT INTO group_members (group_id, user_id) VALUES ({mgmt_group_id}, {admin_id})")

            # (4) Initialize backup settings
            default_backup_config = json.dumps({"type": "daily", "time": "02:00"})
            cursor.execute("INSERT INTO system_settings (`key`, `value`) VALUES ('backup_schedule', %s)", (default_backup_config,))
            print("  - Default system settings created")

        conn.commit()
        print("\n✅ Database reset complete successfully!")
        
    except Exception as e:
        print(f"\n❌ Error resetting database: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    print("="*50)
    print("WARNING: This script will DELETE ALL DATA in the database.")
    print(f"Database Name: {Config.DB_NAME}")
    print("="*50)
    
    confirmation = input("Type 'yes' to confirm reset: ")
    if confirmation.lower().strip() == 'yes':
        reset_database()
    else:
        print("Operation cancelled.")