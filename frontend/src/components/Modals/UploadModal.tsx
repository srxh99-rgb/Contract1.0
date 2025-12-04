import React, { useState } from 'react';
import { X, File, FolderPlus, AlertTriangle } from 'lucide-react';
import { authFetch, API_BASE_URL } from '../../api/client';

// 进度条子组件 (移除 zoom-in)
const ProgressModal = ({ progress, current, total }: any) => {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;
    
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
            <div className="bg-white p-8 rounded-2xl w-80 shadow-2xl flex flex-col items-center animate-in fade-in duration-200">
                <div className="relative w-32 h-32 mb-4">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="64" cy="64" r={radius} stroke="#e2e8f0" strokeWidth="8" fill="transparent" />
                        <circle cx="64" cy="64" r={radius} stroke="#3b82f6" strokeWidth="8" fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-300 ease-out"/>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-blue-600">{Math.round(progress)}%</div>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">正在上传...</h3>
                <p className="text-sm text-gray-500">文件: {current} / {total}</p>
            </div>
        </div>
    );
};

// 查重子组件 (移除 zoom-in)
const DuplicateModal = ({ filenames, onResolve }: any) => (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000]">
        <div className="bg-white p-6 rounded-xl shadow-2xl max-w-md w-full animate-in fade-in duration-200">
            <div className="flex items-center gap-2 mb-4 text-orange-600"><AlertTriangle size={24}/><h3 className="font-bold text-lg">发现重复文件</h3></div>
            <p className="text-gray-600 mb-2">以下 {filenames.length} 个文件已存在：</p>
            <ul className="bg-gray-50 p-3 rounded-lg text-sm text-gray-500 max-h-32 overflow-y-auto mb-6">{filenames.map((f:string, i:number) => <li key={i}>{f}</li>)}</ul>
            <div className="flex flex-col gap-2">
                <button onClick={() => onResolve('rename')} className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium">保留两者 (自动重命名)</button>
                <button onClick={() => onResolve('replace')} className="w-full bg-white border border-red-200 text-red-600 py-2.5 rounded-lg hover:bg-red-50 font-medium">覆盖旧文件</button>
                <button onClick={() => onResolve('cancel')} className="w-full text-gray-400 py-2 hover:text-gray-600 text-sm">取消上传</button>
            </div>
        </div>
    </div>
);

interface Props {
    folderId: number;
    folderName: string;
    onClose: () => void;
    onUploadSuccess: () => void;
    showAlert: (msg: string) => void;
}

export const UploadModal: React.FC<Props> = ({ folderId, folderName, onClose, onUploadSuccess, showAlert }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentFileIdx, setCurrentFileIdx] = useState(0);
    const [totalFiles, setTotalFiles] = useState(0);
    
    const [duplicates, setDuplicates] = useState<string[]>([]);
    const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);

    const initiateUpload = async (files: FileList) => {
        const filenames = Array.from(files).map(f => f.name);
        try {
            const res = await authFetch(`${API_BASE_URL}/files/check_existence`, {
                method: 'POST', body: JSON.stringify({ folder_id: folderId, filenames })
            });
            const dupes = await res.json();
            
            if (dupes.length > 0) {
                setPendingFiles(files);
                setDuplicates(dupes); 
            } else {
                processUpload(files, 'rename');
            }
        } catch (e) {
            showAlert('连接服务器失败，无法检查文件名');
        }
    };

    const processUpload = async (files: FileList, mode: 'replace'|'rename') => {
        setDuplicates([]); 
        setPendingFiles(null);
        setIsUploading(true);
        setTotalFiles(files.length);
        setCurrentFileIdx(0);
        setProgress(0);
        
        let successCount = 0;
        const userStr = sessionStorage.getItem('contract_system_user'); // 确保使用 sessionStorage
        const token = userStr ? JSON.parse(userStr).token : '';

        for(let i = 0; i < files.length; i++) {
            const file = files[i];
            setCurrentFileIdx(i + 1);
            
            const fd = new FormData();
            fd.append('file', file);
            fd.append('folder_id', folderId.toString());
            // @ts-ignore
            fd.append('relative_path', file.webkitRelativePath || file.name);
            fd.append('conflict_mode', mode);

            try {
                await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', `${API_BASE_URL}/upload`);
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                    
                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const percentComplete = (e.loaded / e.total) * 100;
                            const totalProgress = ((i + percentComplete/100) / files.length) * 100;
                            setProgress(totalProgress);
                        }
                    };
                    
                    xhr.onload = () => { 
                        if(xhr.status < 300) { 
                            successCount++; 
                            resolve(xhr.response); 
                        } else {
                            reject(xhr.responseText);
                        }
                    };
                    xhr.onerror = () => reject('Network Error');
                    xhr.send(fd);
                });
            } catch (e) { 
                console.error('Upload error', e);
                showAlert(`文件 ${file.name} 上传失败`);
            }
        }

        setIsUploading(false);
        onUploadSuccess(); 
        onClose(); 
        
        if (successCount === files.length) {
            showAlert('所有文件上传成功');
        } else if (successCount > 0) {
            showAlert(`部分上传成功: ${successCount}/${files.length}`);
        }
    };

    if (isUploading) return <ProgressModal progress={progress} current={currentFileIdx} total={totalFiles} />;

    if (duplicates.length > 0) return (
        <DuplicateModal filenames={duplicates} onResolve={(mode: any) => {
            if(mode === 'cancel') { setDuplicates([]); setPendingFiles(null); }
            else if(pendingFiles) processUpload(pendingFiles, mode);
        }}/>
    );

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000]">
            <div className="bg-white p-6 rounded-xl w-[400px] shadow-2xl animate-in fade-in duration-200">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                  <h3 className="font-bold text-lg text-gray-800">上传至: <span className="text-blue-600">{folderName}</span></h3>
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
                </div>
                <div className="space-y-4">
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer group relative">
                        <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" multiple onChange={(e) => e.target.files && e.target.files.length > 0 && initiateUpload(e.target.files)} />
                        <div className="flex items-center gap-4 pointer-events-none">
                            <div className="bg-blue-100 p-3 rounded-full text-blue-600 group-hover:scale-110 transition-transform"><File size={24}/></div>
                            <div><div className="font-bold text-gray-700 group-hover:text-blue-700">上传文件</div><div className="text-xs text-gray-400 mt-1">支持多选</div></div>
                        </div>
                    </div>
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 hover:border-yellow-400 hover:bg-yellow-50 transition-all cursor-pointer group relative">
                        <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" multiple 
                            // @ts-ignore
                            webkitdirectory="" 
                            onChange={(e) => e.target.files && e.target.files.length > 0 && initiateUpload(e.target.files)} />
                        <div className="flex items-center gap-4 pointer-events-none">
                            <div className="bg-yellow-100 p-3 rounded-full text-yellow-600 group-hover:scale-110 transition-transform"><FolderPlus size={24}/></div>
                            <div><div className="font-bold text-gray-700 group-hover:text-yellow-700">上传文件夹</div><div className="text-xs text-gray-400 mt-1">保持目录结构</div></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};