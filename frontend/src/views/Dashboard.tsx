import React, { useState, useEffect, useCallback } from 'react';
import { 
    Folder, FolderPlus, Upload, ChevronRight, ArrowLeft, Trash2, Edit2, 
    Check, X, FileText, FileSpreadsheet, FileImage, Users, Download as DownloadIcon, Lock, Loader2 
} from 'lucide-react';
import { authFetch, API_BASE_URL } from '../api/client';
import { PermissionModal } from '../components/Modals/PermissionModal';
import { ConfirmModal } from '../components/Modals/ConfirmModal';
import { AlertModal } from '../components/Modals/AlertModal';
import { UploadModal } from '../components/Modals/UploadModal';

const getFileIcon = (type: string) => {
    const t = type?.toLowerCase();
    if(['doc','docx'].includes(t)) return <FileText size={28} className="text-blue-600"/>;
    if(['xls','xlsx'].includes(t)) return <FileSpreadsheet size={28} className="text-green-600"/>;
    if(['png','jpg','jpeg'].includes(t)) return <FileImage size={28} className="text-purple-600"/>;
    return <FileText size={28} className="text-red-500"/>;
};

export default function Dashboard({ user, searchQuery, setSearchQuery, onViewChange }: any) {
    const [contracts, setContracts] = useState<any[]>([]);
    const [folders, setFolders] = useState<any[]>([]);
    const [folderStack, setFolderStack] = useState<{id:number, name:string}[]>([{id:0, name:'根目录'}]);
    const currentFolderId = folderStack[folderStack.length-1].id;

    const [loading, setLoading] = useState(false);
    const [selectedContract, setSelectedContract] = useState<any>(null);
    const [previewUrl, setPreviewUrl] = useState<string|null>(null);

    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [editingId, setEditingId] = useState<{id:number, type:'file'|'folder'}|null>(null);
    const [editingName, setEditingName] = useState('');
    
    const [showUpload, setShowUpload] = useState(false);
    const [permissionTarget, setPermissionTarget] = useState<{id:number, type:'file'|'folder'}|null>(null);
    const [confirmData, setConfirmData] = useState<any>(null);
    
    // 🟢 关键修复：统一使用自定义 Alert
    const [alertMsg, setAlertMsg] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (searchQuery) {
                const res = await authFetch(`${API_BASE_URL}/search?q=${encodeURIComponent(searchQuery)}`);
                const data = await res.json();
                setFolders(data.folders);
                setContracts(data.files);
            } else {
                const [resF, resC] = await Promise.all([
                    authFetch(`${API_BASE_URL}/folders?parent_id=${currentFolderId}`),
                    authFetch(`${API_BASE_URL}/contracts?folder_id=${currentFolderId}`)
                ]);
                setFolders(await resF.json());
                setContracts(await resC.json());
            }
        } catch (e) { console.error(e); } 
        finally { setLoading(false); }
    }, [currentFolderId, searchQuery]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const enterFolder = (id: number, name: string) => {
        setSearchQuery('');
        setFolderStack([...folderStack, {id, name}]);
        setSelectedContract(null);
    };

    const createFolder = async () => {
        if (!newFolderName.trim()) return setIsCreatingFolder(false);
        try {
            await authFetch(`${API_BASE_URL}/folders`, {
                method:'POST', 
                body: JSON.stringify({name: newFolderName, parent_id: currentFolderId})
            });
            setNewFolderName('');
            setIsCreatingFolder(false);
            fetchData();
        } catch(e) { setAlertMsg('创建文件夹失败'); }
    };

    const handleRename = async () => {
        if (!editingId || !editingName.trim()) return setEditingId(null);
        const url = editingId.type === 'folder' ? `${API_BASE_URL}/folders/${editingId.id}` : `${API_BASE_URL}/contracts/${editingId.id}`;
        const body = editingId.type === 'folder' ? {name: editingName} : {title: editingName};
        
        try {
            await authFetch(url, { method:'PUT', body: JSON.stringify(body) });
            setEditingId(null);
            fetchData();
        } catch(e) { setAlertMsg('重命名失败'); }
    };

    const handleEditKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleRename();
    };
    const handleCreateKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') createFolder();
    };

    const handleDelete = (id: number, type: 'file'|'folder') => {
        setConfirmData({
            message: type==='folder' ? '确定删除此文件夹及其所有内容吗？' : '确定删除此文件吗？',
            onConfirm: async () => {
                const url = type === 'folder' ? `${API_BASE_URL}/folders/${id}` : `${API_BASE_URL}/delete_contract/${id}`;
                try {
                    await authFetch(url, { method: type==='folder'?'DELETE':'POST' });
                    fetchData();
                } catch(e) { setAlertMsg('删除失败'); }
                setConfirmData(null);
            },
            onCancel: () => setConfirmData(null)
        });
    };

    useEffect(() => {
        if (selectedContract) {
            setLoading(true);
            authFetch(`${API_BASE_URL}/download/${selectedContract.id}`)
                .then(res => res.ok ? res.blob() : Promise.reject())
                .then(blob => setPreviewUrl(window.URL.createObjectURL(blob)))
                .catch(() => setPreviewUrl(null))
                .finally(() => setLoading(false));
        }
        return () => { if(previewUrl) window.URL.revokeObjectURL(previewUrl); }
    }, [selectedContract]);

    const downloadFile = async (id: number, filename: string) => {
        try {
            const res = await authFetch(`${API_BASE_URL}/download/${id}`, { method: 'POST' });
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = filename; 
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } catch(e) { setAlertMsg('下载失败'); }
    };

    if (selectedContract) {
        return (
            <div className="h-full flex flex-col bg-white">
                <div className="h-14 border-b flex items-center px-6 justify-between shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={()=>setSelectedContract(null)} className="flex items-center gap-1 text-gray-600 hover:text-blue-600">
                            <ArrowLeft size={18}/> 返回
                        </button>
                        <span className="font-bold text-lg">{selectedContract.title}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-xs text-orange-500 bg-orange-50 px-3 py-1 rounded-full border border-orange-100 flex items-center gap-1"><Lock size={12}/> 预览已加密</div>
                        {(user.role === 'admin' || selectedContract.can_download === 1) && (
                            <button onClick={() => downloadFile(selectedContract.id, `SECURED_${selectedContract.title}.pdf`)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1"><DownloadIcon size={14}/> 下载文件</button>
                        )}
                    </div>
                </div>
                <div className="flex-1 relative bg-gray-50">
                    {loading ? <div className="flex items-center justify-center h-full gap-2"><Loader2 className="animate-spin"/> 加载预览...</div> : 
                    previewUrl ? <iframe src={`${previewUrl}#toolbar=0&navpanes=0`} className="absolute inset-0 w-full h-full border-none"/> : 
                    <div className="flex items-center justify-center h-full text-red-400">预览加载失败</div>}
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 p-8 overflow-y-auto h-full relative">
            {/* 全局弹窗区域 */}
            {alertMsg && <AlertModal message={alertMsg} onClose={()=>setAlertMsg('')} />}
            {permissionTarget && <PermissionModal targetId={permissionTarget.id} targetType={permissionTarget.type} onClose={()=>setPermissionTarget(null)} showAlert={setAlertMsg}/>}
            {confirmData && <ConfirmModal {...confirmData} />}
            
            {/* 🟢 修复：传递 showAlert 给上传组件，确保错误提示使用自定义弹窗 */}
            {showUpload && (
                <UploadModal 
                    folderId={currentFolderId} 
                    folderName={folderStack[folderStack.length-1].name} 
                    onClose={()=>setShowUpload(false)} 
                    onUploadSuccess={fetchData} 
                    showAlert={setAlertMsg}
                />
            )}

            {/* 顶部工具栏 */}
            <div className="flex items-center justify-between mb-6">
                {searchQuery ? (
                    <div className="flex items-center gap-4">
                         <button onClick={() => setSearchQuery('')} className="p-2 bg-white border rounded-lg text-gray-600 hover:bg-gray-50"><ArrowLeft size={20}/></button>
                         <h2 className="text-xl font-bold">搜索结果: "{searchQuery}"</h2>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-lg font-bold text-slate-800">
                        {folderStack.length > 1 && <button onClick={()=>setFolderStack(folderStack.slice(0, -1))} className="p-1 hover:bg-gray-200 rounded-full mr-2"><ArrowLeft size={20}/></button>}
                        {folderStack.map((f, i) => (
                            <span key={f.id} className="flex items-center">
                                {i > 0 && <ChevronRight size={16} className="mx-1 text-gray-400"/>}
                                <span className={i===folderStack.length-1 ? 'text-slate-900' : 'text-gray-500'}>{f.name}</span>
                            </span>
                        ))}
                    </div>
                )}
                
                {user.role === 'admin' && !searchQuery && (
                    <div className="flex gap-2">
                        <button onClick={()=>setIsCreatingFolder(true)} className="bg-white border text-slate-600 px-4 py-2 rounded-lg flex items-center gap-2 text-sm hover:bg-gray-50"><FolderPlus size={16}/> 新建文件夹</button>
                        <button onClick={()=>setShowUpload(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm hover:bg-blue-700 shadow-md"><Upload size={16}/> 上传文件</button>
                    </div>
                )}
            </div>

            {/* 新建文件夹行 */}
            {isCreatingFolder && (
                <div className="mb-6 bg-white p-4 rounded-xl border border-blue-100 flex items-center gap-2 w-64 shadow-sm animate-in slide-in-from-top-2">
                    <Folder size={20} className="text-blue-500"/>
                    <input autoFocus value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} onKeyDown={handleCreateKeyDown} placeholder="名称..." className="flex-1 outline-none text-sm"/>
                    <button onClick={createFolder} className="text-green-600 hover:bg-green-50 p-1 rounded"><Check size={16}/></button>
                    <button onClick={()=>{setIsCreatingFolder(false);setNewFolderName('')}} className="text-gray-400 hover:bg-gray-50 p-1 rounded"><X size={16}/></button>
                </div>
            )}

            {/* 文件夹网格 */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                {folders.map(f => (
                    <div key={f.id} onClick={()=>enterFolder(f.id, f.name)} className="bg-white p-5 rounded-xl border border-gray-100 hover:shadow-lg cursor-pointer group relative transition-all flex items-center gap-3">
                        <Folder size={32} className="text-blue-400 fill-blue-50"/>
                        {editingId?.id === f.id && editingId.type === 'folder' ? (
                            <div className="flex items-center gap-1 flex-1" onClick={e=>e.stopPropagation()}>
                                <input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)} onKeyDown={handleEditKeyDown} className="w-full border rounded px-1 py-0.5 text-sm"/>
                                <button onClick={handleRename} className="text-green-600"><Check size={14}/></button>
                            </div>
                        ) : (<span className="font-medium text-slate-700 truncate flex-1">{f.name}</span>)}
                        
                        {user.role === 'admin' && !editingId && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 bg-white pl-2">
                                <button onClick={(e)=>{e.stopPropagation();setPermissionTarget({id:f.id, type:'folder'})}} className="text-gray-400 hover:text-blue-600 p-1"><Users size={14}/></button>
                                <button onClick={(e)=>{e.stopPropagation();setEditingId({id:f.id, type:'folder'});setEditingName(f.name)}} className="text-gray-400 hover:text-blue-600 p-1"><Edit2 size={14}/></button>
                                <button onClick={(e)=>{e.stopPropagation();handleDelete(f.id, 'folder')}} className="text-gray-400 hover:text-red-600 p-1"><Trash2 size={14}/></button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* 文件网格 */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {contracts.map(c => (
                    <div key={c.id} onClick={()=>setSelectedContract(c)} className="bg-white p-5 rounded-xl border border-gray-100 hover:shadow-lg cursor-pointer group relative transition-all hover:-translate-y-1">
                        <div className="flex justify-between mb-3">
                            {getFileIcon(c.file_type)}
                            {user.role === 'admin' && !editingId && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e)=>{e.stopPropagation();setPermissionTarget({id:c.id, type:'file'})}} className="text-gray-400 hover:text-blue-600 p-1"><Users size={14}/></button>
                                    <button onClick={(e)=>{e.stopPropagation();setEditingId({id:c.id, type:'file'});setEditingName(c.title)}} className="text-gray-400 hover:text-blue-600 p-1"><Edit2 size={14}/></button>
                                    <button onClick={(e)=>{e.stopPropagation();handleDelete(c.id, 'file')}} className="text-gray-400 hover:text-red-600 p-1"><Trash2 size={14}/></button>
                                </div>
                            )}
                        </div>
                        {editingId?.id === c.id && editingId.type === 'file' ? (
                            <div className="mb-2 flex items-center gap-1" onClick={e=>e.stopPropagation()}>
                                <input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)} onKeyDown={handleEditKeyDown} className="w-full border rounded px-1 py-0.5 text-sm font-bold"/>
                                <button onClick={handleRename} className="text-green-600"><Check size={14}/></button>
                            </div>
                        ) : (<h3 className="font-bold text-slate-800 truncate mb-1 text-sm" title={c.title}>{c.title}</h3>)}
                        <div className="flex justify-between text-xs text-gray-400 border-t pt-3 mt-2">
                            <span>{c.created_at?.slice(0,10)}</span>
                            <span>{c.file_size || c.size}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}