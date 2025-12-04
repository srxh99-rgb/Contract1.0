import os
import uuid


class Config:
    # 获取当前文件的上级目录的上级目录 (即 backend 根目录)
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    DB_HOST = os.getenv('DB_HOST', '127.0.0.1')
    DB_USER = os.getenv('DB_USER', '*****')
    DB_PASS = os.getenv('DB_PASS', '******')
    DB_NAME = 'contract_system'

    SECRET_KEY = os.getenv('SECRET_KEY') or uuid.uuid4().hex

    FEISHU_APP_ID = "cli_a9ac2ab224fa1cd1"
    FEISHU_APP_SECRET = os.getenv('FEISHU_APP_SECRET', "580ZjrMTq74UD6nUyivZqeH4SdmE3w61")

    # 使用绝对路径，确保在任何地方运行都不会出错
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'contracts_storage')
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)

    ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx'}