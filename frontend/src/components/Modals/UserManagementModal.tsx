import React, { useState, useEffect } from 'react';
import { Plus, Check, Edit2, Trash2, X, Search, UserCog, Loader2 } from 'lucide-react';
import { authFetch, API_BASE_URL } from '../../api/client';

interface Props {
    onClose: () => void;
    showAlert: (msg: string) => void;
}

export const UserManagementModal: React.FC<Props> = ({ onClose, showAlert }) => {
    const [users, setUsers] = useState<any[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [newGroupName, setNewGroupName] = useState('');
    const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
    const [editingGroupName, setEditingGroupName] = useState('');
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [uData, gData] = await Promise.all([
                authFetch(`${API_BASE_URL}/admin/users_with_groups`).then(res => res.json()),
                authFetch(`${API_BASE_URL}/groups`).then(res => res.json())
            ]);
            setUsers(uData);
            setGroups(gData);
        } catch (e) { showAlert('加载失败'); } 
        finally { setLoading(false); }
    };

    const handleGroupChange = async (userId: number, groupIdStr: string) => {
        const groupId = parseInt(groupIdStr);
        try {
            await authFetch(`${API_BASE_URL}/admin/update_user_groups`, {
                method: 'POST', body: JSON.stringify({ user_id: userId, group_ids: [groupId] })
            });
            setUsers(users.map(u => u.id === userId ? { ...u, group_ids: [groupId] } : u));
        } catch (e) { showAlert('更新失败'); }
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) return;
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/create_group`, {
                method: 'POST', body: JSON.stringify({ name: newGroupName })
            });
            if (res.ok) { setNewGroupName(''); loadData(); }
            else { const d = await res.json(); showAlert(d.error); }
        } catch(e) { showAlert('创建失败'); }
    };

    const handleRenameGroup = async (id: number) => {
        if (!editingGroupName.trim()) return;
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/groups/${id}`, {
                method: 'PUT', body: JSON.stringify({ name: editingGroupName })
            });
            if (res.ok) { setEditingGroupId(null); loadData(); }
            else showAlert('重命名失败');
        } catch (e) { showAlert('网络错误'); }
    };

    const handleDeleteGroup = async (id: number, name: string) => {
        if (name === '默认组' || name === '管理组') { showAlert('系统预置组无法删除'); return; }
        if (!confirm(`确定删除组“${name}”吗？该组的所有权限配置将被移除。`)) return;
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/delete_group/${id}`, { method: 'DELETE' });
            if (res.ok) loadData();
            else showAlert('删除失败');
        } catch (e) { showAlert('删除失败'); }
    };

    const handleToggleStatus = async (uid: number, currentStatus: boolean) => {
        try {
            await authFetch(`${API_BASE_URL}/admin/toggle_user_status`, {
                method: 'POST', body: JSON.stringify({ user_id: uid, status: !currentStatus })
            });
            setUsers(users.map(u => u.id === uid ? { ...u, is_active: !currentStatus ? 1 : 0 } : u));
        } catch (e) { showAlert('操作失败'); }
    };

    const filteredUsers = users.filter(u => {
        const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesGroup = selectedGroupId === null || u.group_ids.includes(selectedGroupId);
        return matchesSearch && matchesGroup;
    });

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[900]">
            <div className="bg-white rounded-xl w-[950px] h-[600px] flex flex-row shadow-2xl overflow-hidden animate-in fade-in duration-200">
                <div className="w-72 bg-gray-50 border-r flex flex-col">
                    <div className="p-4 font-bold text-gray-700 border-b">用户组管理</div>
                    <div className="p-3 border-b flex gap-2">
                        <input className="border rounded px-2 py-1 text-sm w-full" placeholder="新建组名..." value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
                        <button onClick={handleCreateGroup} className="bg-green-600 text-white px-2 rounded hover:bg-green-700"><Plus size={16}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <div className={`flex justify-between items-center p-3 hover:bg-gray-100 border-b border-gray-100 cursor-pointer ${selectedGroupId===null?'bg-blue-50':''}`} onClick={()=>setSelectedGroupId(null)}>
                            <span className="font-bold text-sm">全部用户</span>
                        </div>
                        {groups.map(g => (
                            <div key={g.id} className={`flex justify-between items-center p-3 hover:bg-gray-100 border-b border-gray-100 text-sm cursor-pointer ${selectedGroupId===g.id?'bg-blue-50':''}`} onClick={()=>setSelectedGroupId(g.id)}>
                                {editingGroupId === g.id ? (
                                    <div className="flex gap-1 flex-1">
                                        <input autoFocus className="w-full border rounded px-1" value={editingGroupName} onChange={e=>setEditingGroupName(e.target.value)} onClick={e=>e.stopPropagation()}/>
                                        <button onClick={(e)=>{e.stopPropagation(); handleRenameGroup(g.id)}} className="text-green-600"><Check size={14}/></button>
                                    </div>
                                ) : (
                                    <span>{g.name}</span>
                                )}
                                <div className="flex gap-1">
                                    {editingGroupId !== g.id && g.name !== '默认组' && g.name !== '管理组' && (
                                        <button onClick={(e)=>{e.stopPropagation(); setEditingGroupId(g.id); setEditingGroupName(g.name)}} className="text-gray-400 hover:text-blue-600"><Edit2 size={14}/></button>
                                    )}
                                    {g.name !== '默认组' && g.name !== '管理组' && (
                                        <button onClick={(e)=>{e.stopPropagation(); handleDeleteGroup(g.id, g.name)}} className="text-gray-400 hover:text-red-600"><Trash2 size={14}/></button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex-1 flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center">
                        <h3 className="font-bold text-lg flex items-center gap-2"><UserCog className="text-blue-600"/> {selectedGroupId ? `组成员 (${groups.find(g=>g.id===selectedGroupId)?.name})` : '所有人员'}</h3>
                        <button onClick={onClose}><X size={20} className="text-gray-400"/></button>
                    </div>
                    <div className="p-4 border-b bg-white relative">
                        <Search className="absolute left-7 top-6.5 text-gray-400" size={16}/>
                        <input className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-200" placeholder="搜索姓名或邮箱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                        {loading ? <div className="text-center py-10"><Loader2 className="animate-spin mx-auto"/></div> : (
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                                    <tr><th className="p-3 border-b">用户</th><th className="p-3 border-b">所属组</th><th className="p-3 border-b text-center">状态</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredUsers.map(u => (
                                        <tr key={u.id} className="hover:bg-gray-50">
                                            <td className="p-3">
                                                <div className="font-medium">{u.name}</div>
                                                <div className="text-xs text-gray-400">{u.email}</div>
                                            </td>
                                            <td className="p-3">
                                                <select className="border rounded px-2 py-1 w-full outline-none focus:border-blue-500" value={u.group_ids[0] || ''} onChange={(e) => handleGroupChange(u.id, e.target.value)}>
                                                    <option value="" disabled>未分配</option>
                                                    {groups.map(g => (<option key={g.id} value={g.id}>{g.name}</option>))}
                                                </select>
                                            </td>
                                            <td className="p-3 text-center">
                                                <button onClick={()=>handleToggleStatus(u.id, !!u.is_active)} className={`px-2 py-1 rounded text-xs font-bold ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {u.is_active ? '正常' : '已封禁'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};