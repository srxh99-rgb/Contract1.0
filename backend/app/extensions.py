# backend/app/extensions.py
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# 初始化限流器，配置默认限制
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["3000 per day", "600 per hour"],
    storage_uri="memory://"
)