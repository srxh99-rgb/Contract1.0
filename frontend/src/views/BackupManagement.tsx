import { useState, useEffect } from 'react';
import { Save, Play, Trash2, Download, Archive, Clock, RefreshCw } from 'lucide-react';
import { authFetch, API_BASE_URL } from '../api/client';
import { AlertModal } from '../components/Modals/AlertModal';

export default function BackupManagement() {
    const [backups, setBackups] = useState<any[]>([]);
    const [config, setConfig] = useState({ type: 'daily', time: '02:00', day: '0', hours: 24 });
    const [loading, setLoading] = useState(false);
    const [alertMsg, setAlertMsg] = useState('');

    useEffect(() => {
        fetchData();
        fetchConfig();
    }, []);

    const fetchData = async () => {
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/backups`);
            if(res.ok) setBackups(await res.json());
        } catch(e) { console.error(e); }
    };

    const fetchConfig = async () => {
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/backups/config`);
            if(res.ok) {
                const data = await res.json();
                setConfig(prev => ({ ...prev, ...data }));
            }
        } catch(e) { console.error(e); }
    };

    const handleSaveConfig = async () => {
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/backups/config`, {
                method: 'POST',
                body: JSON.stringify(config)
            });
            if(res.ok) setAlertMsg('备份策略已更新');
            else setAlertMsg('更新失败');
        } catch(e) { setAlertMsg('请求失败'); }
    };

    const handleRunNow = async () => {
        if(!confirm('确定要立即执行一次备份吗？可能会占用服务器资源。')) return;
        setLoading(true);
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/backups/run_now`, { method: 'POST' });
            if(res.ok) {
                setAlertMsg('备份已完成');
                fetchData();
            } else {
                setAlertMsg('备份失败');
            }
        } catch(e) { setAlertMsg('请求失败'); }
        finally { setLoading(false); }
    };

    const handleDelete = async (filename: string) => {
        if(!confirm(`确定删除备份文件 ${filename} 吗？`)) return;
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/backups/${filename}`, { method: 'DELETE' });
            if(res.ok) fetchData();
            else setAlertMsg('删除失败');
        } catch(e) { setAlertMsg('请求失败'); }
    };

    const handleDownload = async (filename: string) => {
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/backups/download/${filename}`);
            if(!res.ok) throw new Error('Download failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } catch(e) { setAlertMsg('下载失败'); }
    };

    return (
        <div className="p-8 h-full overflow-y-auto bg-gray-50">
            {alertMsg && <AlertModal message={alertMsg} onClose={()=>setAlertMsg('')} />}
            
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Archive className="text-blue-600"/> 系统备份管理
            </h2>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-8">
                <div className="flex items-center justify-between mb-4 border-b pb-2">
                    <h3 className="font-bold text-gray-700 flex items-center gap-2"><Clock size={18}/> 自动备份策略</h3>
                    <button onClick={handleRunNow} disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 flex items-center gap-2 disabled:opacity-50">
                        {loading ? <RefreshCw className="animate-spin" size={16}/> : <Play size={16}/>} 立即备份
                    </button>
                </div>
                
                <div className="flex flex-wrap gap-6 items-end">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">备份频率</label>
                        <select className="border rounded-lg px-3 py-2 text-sm bg-gray-50 min-w-[120px]" 
                            value={config.type} 
                            onChange={e=>setConfig({...config, type: e.target.value})}
                        >
                            <option value="daily">每天 (Daily)</option>
                            <option value="weekly">每周 (Weekly)</option>
                            <option value="interval">间隔 (Interval)</option>
                        </select>
                    </div>

                    {config.type !== 'interval' && (
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">执行时间</label>
                            <input type="time" className="border rounded-lg px-3 py-2 text-sm"
                                value={config.time}
                                onChange={e=>setConfig({...config, time: e.target.value})}
                            />
                        </div>
                    )}

                    {config.type === 'weekly' && (
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">执行日</label>
                            <select className="border rounded-lg px-3 py-2 text-sm"
                                value={config.day}
                                onChange={e=>setConfig({...config, day: e.target.value})}
                            >
                                <option value="0">周一</option>
                                <option value="1">周二</option>
                                <option value="2">周三</option>
                                <option value="3">周四</option>
                                <option value="4">周五</option>
                                <option value="5">周六</option>
                                <option value="6">周日</option>
                            </select>
                        </div>
                    )}

                    {config.type === 'interval' && (
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">间隔小时数</label>
                            <input type="number" min="1" className="border rounded-lg px-3 py-2 text-sm w-24"
                                value={config.hours}
                                onChange={e=>setConfig({...config, hours: parseInt(e.target.value)})}
                            />
                        </div>
                    )}

                    <button onClick={handleSaveConfig} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2">
                        <Save size={16}/> 保存设置
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-gray-700">现有备份文件</h3>
                    <span className="text-xs text-gray-400">共 {backups.length} 个文件</span>
                </div>
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500">
                        <tr>
                            <th className="p-4">文件名</th>
                            <th className="p-4">大小</th>
                            <th className="p-4">创建时间</th>
                            <th className="p-4 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {backups.length === 0 ? (
                            <tr><td colSpan={4} className="p-8 text-center text-gray-400">暂无备份文件</td></tr>
                        ) : backups.map(b => (
                            <tr key={b.filename} className="border-t hover:bg-gray-50">
                                <td className="p-4 font-mono text-gray-700">{b.filename}</td>
                                <td className="p-4 text-gray-600">{b.size}</td>
                                <td className="p-4 text-gray-600">{b.created_at}</td>
                                <td className="p-4 text-right space-x-2">
                                    <button onClick={()=>handleDownload(b.filename)} className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded inline-flex items-center gap-1 transition-colors">
                                        <Download size={14}/> 下载
                                    </button>
                                    <button onClick={()=>handleDelete(b.filename)} className="text-red-500 hover:bg-red-50 px-2 py-1 rounded inline-flex items-center gap-1 transition-colors">
                                        <Trash2 size={14}/> 删除
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}