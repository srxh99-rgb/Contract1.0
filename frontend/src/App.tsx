// frontend/src/App.tsx
import React, { useState, useEffect } from 'react';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import AuditLogView from './views/AuditLog';
import WatermarkVerifyView from './views/Verify';
import { Sidebar } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { UserManagementModal } from './components/Modals/UserManagementModal';
import { AdminManagementModal } from './components/Modals/AdminManagementModal';
import { AdminProfileModal } from './components/Modals/AdminProfileModal';
import { AlertModal } from './components/Modals/AlertModal';
import { authFetch, API_BASE_URL } from './api/client'; // 引入 authFetch
import BackupManagement from './views/BackupManagement';

export default function App() {
    // 🟢 修改：从 sessionStorage 读取
    const [user, setUser] = useState<any>(() => {
        try { return JSON.parse(sessionStorage.getItem('contract_system_user') || 'null'); } 
        catch { return null; }
    });

    const [currentView, setCurrentView] = useState('files');
    const [searchQuery, setSearchQuery] = useState('');
    const [isVerifying, setIsVerifying] = useState(true); // 新增：校验状态
    
    const [showUserManage, setShowUserManage] = useState(false);
    const [showAdminManage, setShowAdminManage] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [alertMsg, setAlertMsg] = useState('');

    // 🟢 新增：初始化时校验 Token 有效性
    useEffect(() => {
        const verifyToken = async () => {
            if (!user) {
                setIsVerifying(false);
                return;
            }
            try {
                // 调用后端验证接口
                const res = await authFetch(`${API_BASE_URL}/auth/verify`);
                if (!res.ok) throw new Error('Invalid token');
                setIsVerifying(false);
            } catch (e) {
                console.error("Token verification failed:", e);
                handleLogout(); // 校验失败，自动登出
                setIsVerifying(false);
            }
        };
        verifyToken();
    }, []); // 仅在挂载时执行

    const handleLogout = () => {
        // 🟢 修改：清除 sessionStorage
        sessionStorage.removeItem('contract_system_user');
        setUser(null);
    };

    const handleSearch = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setCurrentView('files');
        }
    };

    // 正在校验时显示加载状态，防止页面闪烁
    if (isVerifying) {
        return <div className="min-h-screen flex items-center justify-center text-gray-500">正在验证身份...</div>;
    }

    if (!user) {
        return <Login onLoginSuccess={setUser} />;
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans h-screen overflow-hidden">
            {alertMsg && <AlertModal message={alertMsg} onClose={()=>setAlertMsg('')} />}
            {showUserManage && <UserManagementModal onClose={()=>setShowUserManage(false)} showAlert={setAlertMsg} />}
            {showAdminManage && <AdminManagementModal onClose={()=>setShowAdminManage(false)} showAlert={setAlertMsg} />}
            {showProfile && <AdminProfileModal onClose={()=>setShowProfile(false)} showAlert={setAlertMsg} user={user} />}

            <Header 
                user={user} 
                searchQuery={searchQuery} 
                setSearchQuery={setSearchQuery} 
                onSearch={handleSearch}
                onLogout={handleLogout}
            />

            <div className="flex flex-1 overflow-hidden">
                <Sidebar 
                    currentView={currentView}
                    setCurrentView={setCurrentView}
                    user={user}
                    onOpenUserManage={()=>setShowUserManage(true)}
                    onOpenAdminManage={()=>setShowAdminManage(true)}
                    onOpenProfile={()=>setShowProfile(true)}
                />

                <main className="flex-1 overflow-hidden bg-[#F8FAFC] relative z-10">
                    {currentView === 'files' && (
                        <Dashboard 
                            user={user} 
                            searchQuery={searchQuery} 
                            setSearchQuery={setSearchQuery}
                        />
                    )}
					{currentView === 'backups' && user.role === 'admin' && <BackupManagement />}
                    {currentView === 'logs' && <AuditLogView />}
                    {currentView === 'verify' && <WatermarkVerifyView />}
                </main>
            </div>
        </div>
    );
}