import { useState, useEffect } from 'react';
import { FileClock, Loader2 } from 'lucide-react';
import { authFetch, API_BASE_URL } from '../api/client';

export default function AuditLogView() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await authFetch(`${API_BASE_URL}/audit/logs`);
            if (res.ok) {
                setLogs(await res.json());
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 h-full overflow-y-auto relative">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <FileClock className="text-blue-600"/> 审计日志
            </h2>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-gray-400"/></div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="p-4">时间</th>
                                <th className="p-4">用户</th>
                                <th className="p-4">操作</th>
                                <th className="p-4">对象</th>
                                <th className="p-4">追踪ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => (
                                <tr key={log.id} className="border-t hover:bg-gray-50">
                                    <td className="p-4 text-gray-500 font-mono">{log.created_at}</td>
                                    <td className="p-4 font-medium text-slate-700">{log.user_name}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs ${
                                            log.action_type === 'DOWNLOAD' ? 'bg-green-100 text-green-700' : 
                                            log.action_type === 'PREVIEW' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                                        }`}>
                                            {log.action_type}
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-600">{log.contract_title || '-'}</td>
                                    <td className="p-4 font-mono text-xs text-gray-400">{log.trace_id}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}