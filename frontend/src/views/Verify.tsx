import React, { useState } from 'react';
import { ScanLine, Upload, Loader2, ShieldCheck, User, Mail, Calendar, Hash } from 'lucide-react';
import { authFetch, API_BASE_URL } from '../api/client';

export default function WatermarkVerifyView() {
    const [file, setFile] = useState<File | null>(null);
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const handleVerify = async () => {
        if (!file) return;
        setLoading(true);
        const fd = new FormData();
        fd.append('file', file);
        
        try {
            const res = await authFetch(`${API_BASE_URL}/verify`, { method: 'POST', body: fd });
            const data = await res.json();
            setResult(data.data);
        } catch (e) { alert('验证服务连接失败'); } 
        finally { setLoading(false); }
    };

    return (
        <div className="p-8 h-full flex flex-col">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-gray-800"><ScanLine className="text-blue-600"/> 水印溯源验证</h2>
            <div className="bg-white p-8 rounded-xl shadow-sm border max-w-2xl mx-auto w-full">
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center mb-6 hover:bg-gray-50 transition-colors relative">
                    <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                        onChange={e => {setFile(e.target.files?.[0] || null); setResult(null);}} 
                    />
                    <div className="pointer-events-none flex flex-col items-center gap-3">
                        <Upload size={48} className="text-gray-300" />
                        <span className="text-gray-600 font-medium">
                            {file ? <span className="text-blue-600">{file.name}</span> : "点击或拖拽上传需验证的截图/文件"}
                        </span>
                        <span className="text-xs text-gray-400">支持 PNG, JPG, PDF</span>
                    </div>
                </div>
                
                <button onClick={handleVerify} disabled={!file || loading}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex justify-center items-center gap-2">
                    {loading && <Loader2 className="animate-spin" size={20}/>}
                    {loading ? "正在提取水印信息..." : "开始验证"}
                </button>

                {result && (
                    <div className="mt-8 p-6 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-bottom-4">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b pb-2">
                            <ShieldCheck className="text-green-600"/> 分析结果
                        </h3>
                        
                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-sm text-gray-500">
                                <span>水印类型</span>
                                <span className="font-medium bg-white px-2 py-1 rounded border text-gray-800">{result.type}</span>
                            </div>

                            {result.details && result.details.user ? (
                                <div className="grid grid-cols-2 gap-4 mt-2">
                                    <div className="bg-white p-3 rounded border border-slate-200 flex items-center gap-3">
                                        <div className="bg-blue-100 p-2 rounded-full text-blue-600"><User size={16}/></div>
                                        <div>
                                            <div className="text-xs text-gray-400">下载用户</div>
                                            <div className="font-medium text-sm">{result.details.user}</div>
                                        </div>
                                    </div>
                                    <div className="bg-white p-3 rounded border border-slate-200 flex items-center gap-3">
                                        <div className="bg-purple-100 p-2 rounded-full text-purple-600"><Mail size={16}/></div>
                                        <div>
                                            <div className="text-xs text-gray-400">用户邮箱</div>
                                            <div className="font-medium text-sm truncate w-32" title={result.details.email}>{result.details.email}</div>
                                        </div>
                                    </div>
                                    <div className="bg-white p-3 rounded border border-slate-200 flex items-center gap-3">
                                        <div className="bg-orange-100 p-2 rounded-full text-orange-600"><Calendar size={16}/></div>
                                        <div>
                                            <div className="text-xs text-gray-400">下载时间</div>
                                            <div className="font-medium text-sm">{result.details.time}</div>
                                        </div>
                                    </div>
                                    <div className="bg-white p-3 rounded border border-slate-200 flex items-center gap-3">
                                        <div className="bg-gray-100 p-2 rounded-full text-gray-600"><Hash size={16}/></div>
                                        <div>
                                            <div className="text-xs text-gray-400">Trace ID</div>
                                            <div className="font-mono text-xs truncate w-32" title={result.details.trace_id}>{result.details.trace_id}</div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-slate-800 text-green-400 p-4 rounded-lg font-mono text-xs break-all">
                                    {typeof result.info === 'string' ? result.info : JSON.stringify(result.info, null, 2)}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}