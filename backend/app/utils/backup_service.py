# backend/app/utils/backup_service.py
import os
import zipfile
import time
import shutil
import json
from datetime import datetime
from app.db import get_db_connection

class BackupManager:
    def __init__(self, root_path):
        self.backup_root = os.path.join(root_path, 'backup')
        if not os.path.exists(self.backup_root):
            os.makedirs(self.backup_root)

    def _get_folder_paths(self, cursor):
        """(逻辑同之前，构建文件夹路径映射)"""
        cursor.execute("SELECT id, name, parent_id FROM folders")
        folders = cursor.fetchall()
        folder_map = {f['id']: f for f in folders}
        path_map = {0: ""}
        unresolved = list(folders)
        
        while unresolved:
            progress = False
            for f in unresolved[:]:
                pid = f['parent_id']
                if pid in path_map:
                    parent_path = path_map[pid]
                    path_map[f['id']] = os.path.join(parent_path, f['name']) if parent_path else f['name']
                    unresolved.remove(f)
                    progress = True
            if not progress: break # 防止死循环
        return path_map

    def create_backup(self):
        """创建备份"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        zip_filename = f"backup_{timestamp}.zip"
        zip_filepath = os.path.join(self.backup_root, zip_filename)
        temp_dir = os.path.join(self.backup_root, f"temp_{timestamp}")
        
        if os.path.exists(temp_dir): shutil.rmtree(temp_dir)
        os.makedirs(temp_dir)

        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                path_map = self._get_folder_paths(cursor)
                cursor.execute("SELECT title, file_path, folder_id FROM contracts")
                files = cursor.fetchall()
                
                for file_info in files:
                    rel_dir = path_map.get(file_info['folder_id'], "")
                    dest_dir = os.path.join(temp_dir, rel_dir)
                    if not os.path.exists(dest_dir): os.makedirs(dest_dir)
                    
                    src = file_info['file_path']
                    if os.path.exists(src):
                        dest = os.path.join(dest_dir, file_info['title'])
                        # 处理重名
                        if os.path.exists(dest):
                            base, ext = os.path.splitext(file_info['title'])
                            dest = os.path.join(dest_dir, f"{base}_{int(time.time())}{ext}")
                        shutil.copy2(src, dest)

            with zipfile.ZipFile(zip_filepath, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(temp_dir):
                    for file in files:
                        abs_path = os.path.join(root, file)
                        rel_path = os.path.relpath(abs_path, temp_dir)
                        zipf.write(abs_path, rel_path)
            return zip_filename
        finally:
            conn.close()
            if os.path.exists(temp_dir): shutil.rmtree(temp_dir)

    def list_backups(self):
        """列出所有备份文件"""
        backups = []
        if not os.path.exists(self.backup_root): return []
        
        for f in os.listdir(self.backup_root):
            if f.endswith('.zip') and f.startswith('backup_'):
                full_path = os.path.join(self.backup_root, f)
                stat = os.stat(full_path)
                backups.append({
                    "filename": f,
                    "size": f"{stat.st_size / 1024 / 1024:.2f} MB",
                    "created_at": datetime.fromtimestamp(stat.st_ctime).strftime('%Y-%m-%d %H:%M:%S')
                })
        # 按时间倒序
        return sorted(backups, key=lambda x: x['created_at'], reverse=True)

    def delete_backup(self, filename):
        """删除指定备份"""
        # 安全检查：只允许删除 backup_ 开头的 zip
        if not filename.startswith('backup_') or not filename.endswith('.zip'):
            raise ValueError("Invalid filename")
        
        path = os.path.join(self.backup_root, filename)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False
    
    def get_backup_path(self, filename):
        """获取文件绝对路径用于下载"""
        if not filename.startswith('backup_') or not filename.endswith('.zip'):
            return None
        path = os.path.join(self.backup_root, filename)
        return path if os.path.exists(path) else None