import React from 'react';
import { Folder, UserCog, ShieldCheck, FileClock, ScanLine, Settings } from 'lucide-react';

interface SidebarProps {
    currentView: string;
    setCurrentView: (view: string) => void;
    user: any;
    onOpenUserManage: () => void;
    onOpenAdminManage: () => void;
    onOpenProfile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
    currentView, setCurrentView, user, 
    onOpenUserManage, onOpenAdminManage, onOpenProfile 
}) => {
    const isAdmin = user.role === 'admin';
    const isSuperAdmin = user.username === 'admin';

    const MenuItem = ({ view, icon: Icon, label }: any) => (
        <button 
            onClick={() => setCurrentView(view)} 
            className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-all ${
                currentView === view ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
            }`}
        >
            <Icon size={18}/> {label}
        </button>
    );

    return (
        <aside className="w-64 bg-white border-r flex flex-col shadow-sm z-20">
            <div className="p-4 border-b border-gray-50">
                <span className="text-xs font-bold text-gray-500 uppercase">系统菜单</span>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                <MenuItem view="files" icon={Folder} label="文件浏览" />
                
                {isAdmin && (
                    <>
                        <button onClick={onOpenUserManage} className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all">
                            <UserCog size={18}/> 人员分组管理
                        </button>
                        
                        {isSuperAdmin && (
                            <button onClick={onOpenAdminManage} className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 transition-all border border-purple-100 mt-2 mb-2">
                                <ShieldCheck size={18}/> 管理员管理
                            </button>
                        )}
                        
                        <MenuItem view="logs" icon={FileClock} label="审计日志" />
                        <MenuItem view="verify" icon={ScanLine} label="水印验证" />
                    </>
                )}
            </nav>
            
            {isAdmin && (
                <div className="p-4 border-t border-gray-50 bg-gray-50">
                    <button onClick={onOpenProfile} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm">
                        <Settings size={16}/> 管理员设置
                    </button>
                </div>
            )}
        </aside>
    );
};