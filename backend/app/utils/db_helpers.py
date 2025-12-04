def get_user_group_ids(cursor, user_id):
    cursor.execute("SELECT group_id FROM group_members WHERE user_id = %s", (user_id,))
    return [r['group_id'] for r in cursor.fetchall()]

def get_users_in_group(cursor, group_id):
    cursor.execute("SELECT user_id FROM group_members WHERE group_id = %s", (group_id,))
    return [row['user_id'] for row in cursor.fetchall()]

def get_all_sub_folder_ids(cursor, folder_id):
    ids = [folder_id]
    cursor.execute("SELECT id FROM folders WHERE parent_id = %s", (folder_id,))
    for sub in cursor.fetchall(): ids.extend(get_all_sub_folder_ids(cursor, sub['id']))
    return ids

def get_all_sub_file_ids(cursor, folder_id):
    folder_ids = get_all_sub_folder_ids(cursor, folder_id)
    if not folder_ids: return []
    fmt = ','.join(['%s'] * len(folder_ids))
    cursor.execute(f"SELECT id FROM contracts WHERE folder_id IN ({fmt})", tuple(folder_ids))
    return [f['id'] for f in cursor.fetchall()]