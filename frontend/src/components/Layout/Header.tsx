import React from 'react';
import { Shield, Search, LogOut } from 'lucide-react';

interface HeaderProps {
    user: any;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    onSearch: (e: React.KeyboardEvent) => void;
    onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, searchQuery, setSearchQuery, onSearch, onLogout }) => {
    return (
        <header className="bg-white border-b h-16 px-6 flex justify-between items-center sticky top-0 z-40 shadow-sm shrink-0">
            <div className="font-bold flex items-center gap-2 text-lg text-slate-800">
                <Shield className="text-blue-600 fill-blue-100" size={24}/> 
                索贝合同管理
            </div>
            
            <div className="flex-1 mx-10 max-w-xl relative">
                <input 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={onSearch}
                    className="w-full bg-gray-100 border-none rounded-full px-4 py-2 pl-10 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                    placeholder="搜索文件 or 文件夹 (Enter)..."
                />
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            </div>

            <div className="flex items-center gap-4 text-sm">
                <div className="text-right hidden sm:block">
                    <div className="font-bold text-slate-800">{user.name}</div>
                    <div className="text-xs text-gray-500">{user.email || '普通用户'}</div>
                </div>
                <button 
                    onClick={onLogout} 
                    className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors" 
                    title="退出登录"
                >
                    <LogOut size={18}/>
                </button>
            </div>
        </header>
    );
};