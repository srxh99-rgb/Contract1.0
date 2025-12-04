# backend/app/scheduler.py
import json
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from flask import current_app
from app.db import get_db_connection
from app.utils.backup_service import BackupManager

scheduler = BackgroundScheduler()

def backup_task(app):
    """实际执行的备份任务，需要应用上下文"""
    with app.app_context():
        try:
            # 假设 app.root_path 指向 backend/app，我们需要 backend/ 根目录
            root_dir = os.path.dirname(app.root_path)
            bm = BackupManager(root_dir)
            filename = bm.create_backup()
            logging.info(f"Scheduled backup created: {filename}")
        except Exception as e:
            logging.error(f"Backup task failed: {e}")

def init_scheduler(app):
    """初始化调度器"""
    if not scheduler.running:
        scheduler.start()
    update_backup_job(app)

def update_backup_job(app):
    """从数据库读取配置并更新任务"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT value FROM system_settings WHERE `key`='backup_schedule'")
            row = cursor.fetchone()
            if not row: return
            
            config = json.loads(row['value'])
            scheduler.remove_all_jobs() # 清除旧任务
            
            # 解析配置
            # 格式示例: 
            # Daily: {"type": "daily", "time": "03:00"}
            # Weekly: {"type": "weekly", "day": "6", "time": "03:00"} (0=Mon, 6=Sun)
            # Interval: {"type": "interval", "hours": 12}
            
            trigger = None
            if config['type'] == 'daily':
                hour, minute = config['time'].split(':')
                trigger = CronTrigger(hour=hour, minute=minute)
            elif config['type'] == 'weekly':
                hour, minute = config['time'].split(':')
                trigger = CronTrigger(day_of_week=config['day'], hour=hour, minute=minute)
            elif config['type'] == 'interval':
                trigger = 'interval' # 需要特殊处理
            
            if config['type'] == 'interval':
                scheduler.add_job(
                    func=backup_task, 
                    args=[app], 
                    trigger='interval', 
                    hours=int(config.get('hours', 24)),
                    id='backup_job',
                    replace_existing=True
                )
            elif trigger:
                scheduler.add_job(
                    func=backup_task, 
                    args=[app], 
                    trigger=trigger,
                    id='backup_job',
                    replace_existing=True
                )
            
            logging.info(f"Backup schedule updated: {config}")
            
    except Exception as e:
        logging.error(f"Failed to update scheduler: {e}")
    finally:
        conn.close()