import React, { useState, useEffect } from 'react';
import { X, Save, User, Users, Loader2 } from 'lucide-react';
import { authFetch, API_BASE_URL } from '../../api/client';

interface Props {
    targetId: number;
    targetType: 'file' | 'folder';
    onClose: () => void;
    showAlert: (msg: string) => void;
}

export const PermissionModal: React.FC<Props> = ({ targetId, targetType, onClose, showAlert }) => {
    const [permissions, setPermissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPermissions();
    }, [targetId, targetType]);

    const loadPermissions = async () => {
        setLoading(true);
        try {
            const endpoint = targetType === 'folder' ? `/permissions/folder/${targetId}` : `/permissions/${targetId}`;
            const res = await authFetch(`${API_BASE_URL}${endpoint}`);
            if (res.ok) {
                setPermissions(await res.json());
            }
        } catch (e) {
            console.error(e);
            showAlert('加载权限失败');
        } finally {
            setLoading(false);
        }
    };

    const togglePerm = (index: number, type: 'can_view' | 'can_download') => {
        const newPerms = [...permissions];
        newPerms[index][type] = !newPerms[index][type];
        setPermissions(newPerms);
    };

    const handleSave = async () => {
        try {
            const endpoint = targetType === 'folder' ? `/permissions/folder/${targetId}` : `/permissions/${targetId}`;
            // 🟢 修复：确保 res 的逻辑在 try 块内完成
            const res = await authFetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                body: JSON.stringify(permissions)
            });
            
            if (res.ok) {
                showAlert('权限已保存');
                onClose();
            } else {
                showAlert('保存失败');
            }
        } catch (e) {
            showAlert('请求失败');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-[600px] h-[500px] flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="font-bold text-gray-800">设置{targetType === 'folder' ? '文件夹' : '文件'}权限</h3>
                    <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-gray-500 sticky top-0">
                                <tr>
                                    <th className="p-3 text-left">用户/组</th>
                                    <th className="p-3 text-center">查看</th>
                                    <th className="p-3 text-center">下载</th>
                                </tr>
                            </thead>
                            <tbody>
                                {permissions.map((p, i) => (
                                    <tr key={`${p.subject_type}_${p.subject_id}`} className="border-b hover:bg-gray-50">
                                        <td className="p-3">
                                            <div className="flex items-center gap-2">
                                                {p.subject_type === 'group' ? <Users size={16} className="text-purple-500"/> : <User size={16} className="text-blue-500"/>}
                                                <div>
                                                    <div className="font-medium text-gray-700">{p.name}</div>
                                                    {p.email && <div className="text-xs text-gray-400">{p.email}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            <input 
                                                type="checkbox" 
                                                checked={p.can_view || p.inherited_view} 
                                                disabled={p.inherited_view}
                                                onChange={() => togglePerm(i, 'can_view')}
                                                className="rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            {p.inherited_view && <span className="text-xs text-gray-400 block transform scale-90">(继承)</span>}
                                        </td>
                                        <td className="p-3 text-center">
                                            <input 
                                                type="checkbox" 
                                                checked={p.can_download || p.inherited_download} 
                                                disabled={p.inherited_download}
                                                onChange={() => togglePerm(i, 'can_download')}
                                                className="rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            {p.inherited_download && <span className="text-xs text-gray-400 block transform scale-90">(继承)</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-white border rounded hover:bg-gray-50 text-sm">取消</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm flex items-center gap-2">
                        <Save size={16}/> 保存更改
                    </button>
                </div>
            </div>
        </div>
    );
};