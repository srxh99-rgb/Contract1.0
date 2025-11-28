import React, { useState, useEffect } from 'react';
import { User, Group, X, Loader2 } from 'lucide-react';
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
        const fetchPerms = async () => {
            try {
                const url = targetType === 'folder' ? `${API_BASE_URL}/permissions/folder/${targetId}` : `${API_BASE_URL}/permissions/${targetId}`;
                const res = await authFetch(url);
                if (res.ok) setPermissions(await res.json());
                else showAlert('加载权限失败');
            } catch (e) { showAlert('网络错误'); }
            finally { setLoading(false); }
        };
        fetchPerms();
    }, [targetId, targetType]);

    const handleToggle = (subjectId: number, subjectType: string, field: 'can_view' | 'can_download') => {
        setPermissions(permissions.map(p => {
            if(p.subject_id === subjectId && p.subject_type === subjectType) {
                const newVal = !p[field];
                if(field === 'can_download' && newVal && !p.can_view) return { ...p, can_download: true, can_view: true };
                if(field === 'can_view' && !newVal && p.can_download) return { ...p, can_view: false, can_download: false };
                return { ...p, [field]: newVal };
            }
            return p;
        }));
    };

    const handleSave = async () => {
        const url = targetType === 'folder' ? `${API_BASE_URL}/permissions/folder/${targetId}` : `${API_BASE_URL}/permissions/${targetId}`;
        try {
            await authFetch(url, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(permissions)
            });
            if(res.ok) { showAlert('权限已保存'); onClose(); }
            else showAlert('保存失败');
        } catch(e) { showAlert('网络错误'); }
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[900]">
            <div className="bg-white rounded-xl w-[600px] h-[500px] flex flex-col shadow-2xl animate-in fade-in duration-200">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg text-gray-800">权限设置 - {targetType==='folder'?'文件夹':'文件'} #{targetId}</h3>
                    <button onClick={onClose}><X size={20} className="text-gray-400"/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? <div className="text-center py-10"><Loader2 className="animate-spin mx-auto"/></div> : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500">
                                <tr><th className="p-3">对象</th><th className="p-3 text-center">查看</th><th className="p-3 text-center">下载</th></tr>
                            </thead>
                            <tbody className="divide-y">
                                {permissions.map(p => (
                                    <tr key={`${p.subject_type}_${p.subject_id}`}>
                                        <td className="p-3">
                                            <div className="font-medium flex items-center gap-2">
                                                {p.subject_type==='group'?<Group size={16} className="text-blue-500"/>:<User size={16} className="text-gray-500"/>}
                                                {p.name}
                                            </div>
                                            {p.subject_type==='user' && <div className="text-xs text-gray-400 ml-6">{p.email}</div>}
                                        </td>
                                        <td className="p-3 text-center">
                                            <input type="checkbox" checked={p.can_view} onChange={()=>handleToggle(p.subject_id, p.subject_type, 'can_view')} disabled={p.inherited_view} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                                            {p.inherited_view && <div className="text-[10px] text-gray-400">继承自组</div>}
                                        </td>
                                        <td className="p-3 text-center">
                                            <input type="checkbox" checked={p.can_download} onChange={()=>handleToggle(p.subject_id, p.subject_type, 'can_download')} disabled={p.inherited_download} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                                            {p.inherited_download && <div className="text-[10px] text-gray-400">继承自组</div>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-end"><button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存更改</button></div>
            </div>
        </div>
    );
};