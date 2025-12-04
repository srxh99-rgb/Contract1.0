import React, { useState, useEffect } from 'react';
import { ShieldCheck, X, Plus, Trash2, Loader2 } from 'lucide-react';
import { authFetch, API_BASE_URL } from '../../api/client';

const ResetPasswordModal = ({ userId, onClose, onConfirm }: any) => {
    const [password, setPassword] = useState('');
    // 内层弹窗 z-index 更高
    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1100]">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-96 animate-in fade-in duration-200">
                <h3 className="font-bold text-lg mb-4 text-gray-800">重置管理员密码</h3>
                <input className="w-full border rounded px-3 py-2 text-sm mb-4" placeholder="新密码" value={password} onChange={e=>setPassword(e.target.value)} autoFocus/>
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">取消</button>
                    <button onClick={() => onConfirm(userId, password)} disabled={!password} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">确认重置</button>
                </div>
            </div>
        </div>
    );
};

interface Props {
    onClose: () => void;
    showAlert: (msg: string) => void;
}

export const AdminManagementModal: React.FC<Props> = ({ onClose, showAlert }) => {
    const [admins, setAdmins] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [newAdmin, setNewAdmin] = useState({ username: '', password: '', name: '' });
    const [resetTargetId, setResetTargetId] = useState<number | null>(null);

    useEffect(() => { loadAdmins(); }, []);

    const loadAdmins = async () => {
        setLoading(true);
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/admins`);
            if (res.ok) setAdmins(await res.json());
            else showAlert('权限不足');
        } catch(e) { showAlert('加载失败'); }
        finally { setLoading(false); }
    };

    const handleCreateAdmin = async () => {
        if(!newAdmin.username || !newAdmin.password) return showAlert('请填写完整信息');
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/create_admin`, {
                method: 'POST', body: JSON.stringify(newAdmin)
            });
            if (res.ok) {
                showAlert('创建成功');
                setNewAdmin({ username: '', password: '', name: '' });
                loadAdmins();
            } else {
                const d = await res.json();
                showAlert(d.error || '创建失败');
            }
        } catch(e) { showAlert('创建失败'); }
    };

    const confirmResetPassword = async (uid: number, newPwd: string) => {
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/reset_password`, {
                method: 'POST', body: JSON.stringify({ user_id: uid, password: newPwd })
            });
            if(res.ok) { showAlert('密码重置成功'); setResetTargetId(null); }
            else { const d = await res.json(); showAlert(d.error || '重置失败'); }
        } catch(e) { showAlert('重置失败'); }
    };

    const handleUnbindMfa = async (uid: number) => {
        if(!confirm('确定要强制解绑该管理员的 MFA 吗？')) return;
        try {
            await authFetch(`${API_BASE_URL}/admin/mfa/unbind`, {
                method: 'POST', body: JSON.stringify({ user_id: uid })
            });
            showAlert('解绑成功');
            loadAdmins();
        } catch(e) { showAlert('操作失败'); }
    }

    const handleDeleteAdmin = async (uid: number, username: string) => {
        if(!confirm(`确定要删除管理员 "${username}" 吗？`)) return;
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/delete_admin/${uid}`, { method: 'DELETE' });
            if(res.ok) { showAlert('已删除'); loadAdmins(); }
            else { const d = await res.json(); showAlert(d.error || '删除失败'); }
        } catch(e) { showAlert('请求失败'); }
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[900]">
            {resetTargetId && <ResetPasswordModal userId={resetTargetId} onClose={() => setResetTargetId(null)} onConfirm={confirmResetPassword} />}

            <div className="bg-white rounded-xl w-[800px] h-[600px] flex flex-col shadow-2xl animate-in fade-in duration-200">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg flex items-center gap-2"><ShieldCheck className="text-purple-600"/> 管理员账号管理</h3>
                    <button onClick={onClose}><X size={20} className="text-gray-400"/></button>
                </div>
                
                <div className="p-4 bg-gray-50 border-b flex gap-3 items-end">
                    <div><div className="text-xs text-gray-500 mb-1">登录账号</div><input className="border rounded px-2 py-1 text-sm w-32 text-gray-900" value={newAdmin.username} onChange={e=>setNewAdmin({...newAdmin, username: e.target.value})}/></div>
                    <div><div className="text-xs text-gray-500 mb-1">显示名称</div><input className="border rounded px-2 py-1 text-sm w-32 text-gray-900" value={newAdmin.name} onChange={e=>setNewAdmin({...newAdmin, name: e.target.value})}/></div>
                    <div><div className="text-xs text-gray-500 mb-1">初始密码</div><input className="border rounded px-2 py-1 text-sm w-32 text-gray-900" type="text" placeholder="建议8位以上" value={newAdmin.password} onChange={e=>setNewAdmin({...newAdmin, password: e.target.value})}/></div>
                    <button onClick={handleCreateAdmin} className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700 flex items-center gap-1 h-8"><Plus size={14}/> 新增管理员</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? <div className="text-center py-10"><Loader2 className="animate-spin mx-auto"/></div> : (
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-500">
                                <tr><th className="p-3 border-b">账号</th><th className="p-3 border-b">名称</th><th className="p-3 border-b text-center">MFA状态</th><th className="p-3 border-b text-right">操作</th></tr>
                            </thead>
                            <tbody>
                                {admins.map(a => (
                                    <tr key={a.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-mono">{a.username}</td>
                                        <td className="p-3">{a.name}</td>
                                        <td className="p-3 text-center">
                                            {a.mfa_enabled ? <span className="text-green-600 bg-green-100 px-2 py-0.5 rounded text-xs">已开启</span> : <span className="text-gray-400">未开启</span>}
                                        </td>
                                        <td className="p-3 text-right space-x-3">
                                            <button onClick={()=>setResetTargetId(a.id)} className="text-blue-600 hover:underline text-xs">重置密码</button>
                                            {a.mfa_enabled === 1 && <button onClick={()=>handleUnbindMfa(a.id)} className="text-orange-600 hover:underline text-xs">解绑MFA</button>}
                                            <button onClick={()=>handleDeleteAdmin(a.id, a.username)} className="text-red-600 hover:underline text-xs flex items-center gap-1 float-right ml-2"><Trash2 size={12}/> 删除</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};