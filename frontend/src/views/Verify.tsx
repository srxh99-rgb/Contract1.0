import React, { useState } from 'react';
import { ScanLine, Upload, Check, AlertTriangle, FileText, Loader2, Image as ImageIcon } from 'lucide-react';
import { authFetch, API_BASE_URL } from '../api/client';

export default function WatermarkVerifyView() {
    const [file, setFile] = useState<File|null>(null);
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
        }
    };

    const handleVerify = async () => {
        if (!file) return;
        setLoading(true);
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const res = await authFetch(`${API_BASE_URL}/audit/verify_watermark`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            setResult(data);
        } catch (e) {
            setResult({ info: "验证请求失败" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 h-full overflow-y-auto">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <ScanLine className="text-blue-600"/> 水印追溯验证
            </h2>
            
            <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50 mb-6 hover:bg-blue-50 hover:border-blue-300 transition-colors">
                    <input 
                        type="file" 
                        onChange={handleFileChange} 
                        className="hidden" 
                        id="verify-upload"
                        accept=".pdf,.png,.jpg,.jpeg"
                    />
                    <label htmlFor="verify-upload" className="cursor-pointer flex flex-col items-center gap-2">
                        <Upload size={32} className="text-gray-400"/>
                        <span className="text-gray-600 font-medium">点击上传待验证文件 (PDF/图片)</span>
                        <span className="text-xs text-gray-400">支持检测隐形水印和元数据指纹</span>
                    </label>
                </div>

                {file && (
                    <div className="flex items-center justify-between mb-6 bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <div className="flex items-center gap-2">
                            {file.type.includes('pdf') ? <FileText className="text-red-500"/> : <ImageIcon className="text-purple-500"/>}
                            <span className="font-medium text-slate-700">{file.name}</span>
                        </div>
                        <button 
                            onClick={handleVerify} 
                            disabled={loading}
                            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading && <Loader2 className="animate-spin" size={14}/>} 开始验证
                        </button>
                    </div>
                )}

                {result && (
                    <div className={`p-6 rounded-xl border ${
                        result.info.includes('未检测到') ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
                    }`}>
                        <div className="flex items-start gap-3 mb-4">
                            {result.info.includes('未检测到') ? (
                                <AlertTriangle className="text-red-500 mt-1"/>
                            ) : (
                                <Check className="text-green-600 mt-1"/>
                            )}
                            <div>
                                <h3 className={`font-bold text-lg ${
                                    result.info.includes('未检测到') ? 'text-red-700' : 'text-green-700'
                                }`}>验证结果</h3>
                                <pre className="mt-2 text-sm text-gray-700 whitespace-pre-wrap font-mono bg-white/50 p-3 rounded border border-black/5">
                                    {result.info}
                                </pre>
                            </div>
                        </div>

                        {result.details && Object.keys(result.details).length > 0 && (
                            <div className="mt-4 pt-4 border-t border-black/5">
                                <h4 className="font-bold text-sm text-gray-700 mb-2">结构化数据:</h4>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    {Object.entries(result.details).map(([k, v]: any) => (
                                        <div key={k} className="flex flex-col">
                                            <span className="text-xs text-gray-500 uppercase">{k}</span>
                                            <span className="font-medium break-all">{v}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
