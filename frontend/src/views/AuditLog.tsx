import React, { useState, useEffect } from 'react';
import { FileClock, Loader2 } from 'lucide-react';
import { authFetch, API_BASE_URL } from '../api/client';

export default function AuditLogView() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        authFetch(`${API_BASE_URL}/logs`)
            .then(res => res.ok ? res.json() : [])
            .then(data => setLogs(data))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="p-8 h-full flex flex-col overflow-hidden">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-gray-800"><FileClock className="text-blue-600"/> 审计日志</h2>
            <div className="bg-white rounded-xl shadow-sm border flex-1 flex flex-col overflow-hidden">
                <div className="overflow-y-auto flex-1 p-4">
                    {loading ? <div className="text-center py-10"><Loader2 className="animate-spin mx-auto"/></div> : (
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                            <tr>
                                <th className="p-4 font-medium border-b">时间</th>
                                <th className="p-4 font-medium border-b">操作人</th>
                                <th className="p-4 font-medium border-b">行为</th>
                                <th className="p-4 font-medium border-b">涉及文件</th>
                                <th className="p-4 font-medium border-b">Trace ID</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {logs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="p-4 text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                                    <td className="p-4">
                                        <div className="font-medium text-gray-900">{log.user_name || '未知'}</div>
                                        <div className="text-xs text-gray-400">{log.user_email}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                            log.action_type.includes('DELETE') ? 'bg-red-100 text-red-700' :
                                            log.action_type.includes('LOGIN') ? 'bg-green-100 text-green-700' :
                                            'bg-blue-100 text-blue-700'
                                        }`}>
                                            {log.action_type}
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-600 max-w-xs truncate" title={log.file_name}>{log.file_name || '-'}</td>
                                    <td className="p-4 font-mono text-xs text-gray-400">{log.trace_id}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    )}
                </div>
            </div>
        </div>
    );
}