# backend/fix_admin.py
import pymysql
from app.config import Config

def fix_admin_status():
    conn = pymysql.connect(
        host=Config.DB_HOST,
        user=Config.DB_USER,
        password=Config.DB_PASS,
        database=Config.DB_NAME,
        cursorclass=pymysql.cursors.DictCursor
    )
    try:
        with conn.cursor() as cursor:
            # 强制设置 admin 用户需修改密码
            print("正在更新 admin 用户状态...")
            cursor.execute("UPDATE users SET force_change_password = 1, mfa_secret = NULL WHERE username = 'admin'")
            conn.commit()
            print("✅ 成功！Admin 用户现在登录将触发【首次设置流程】（修改密码 + 绑定MFA）。")
    except Exception as e:
        print(f"❌ 更新失败: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    fix_admin_status()