import datetime
import hashlib
import re

def get_beijing_time():
    return datetime.datetime.utcnow() + datetime.timedelta(hours=8)

def check_password_complexity(password):
    if len(password) < 8: return False
    if not re.search(r'[a-z]', password): return False
    if not re.search(r'[A-Z]', password): return False
    if not re.search(r'\d', password): return False
    if not re.search(r'[!@#$%^&*(),.?":{}|<>\-_=+[\];\'`~/]', password): return False
    return True

def calculate_file_hash(file_path):
    sha256_hash = hashlib.md5()
    try:
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""): sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    except: return "unknown_hash"