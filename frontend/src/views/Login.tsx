// frontend/src/views/Login.tsx
import React, { useState, useEffect } from 'react';
import { Smartphone, LayoutGrid, Settings, Loader2 } from 'lucide-react';
import { API_BASE_URL, FEISHU_APP_ID, REDIRECT_URI } from '../api/client';
import { AlertModal } from '../components/Modals/AlertModal';
import { FirstTimeSetupModal } from '../components/Modals/FirstTimeSetupModal';

interface LoginProps {
    onLoginSuccess: (user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
    const [isAdminMode, setIsAdminMode] = useState(window.location.pathname === '/admin');
    const [loading, setLoading] = useState(false);
    const [alertMsg, setAlertMsg] = useState('');
    
    const [adminUser, setAdminUser] = useState('admin');
    const [adminPass, setAdminPass] = useState('');
    const [captchaUrl, setCaptchaUrl] = useState('');
    const [captchaToken, setCaptchaToken] = useState('');
    const [captchaCode, setCaptchaCode] = useState('');
    
    const [isMfaRequired, setIsMfaRequired] = useState(false);
    const [preAuthToken, setPreAuthToken] = useState('');
    const [loginMfaCode, setLoginMfaCode] = useState('');
    
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [tempUser, setTempUser] = useState<any>(null);

    useEffect(() => {
        const code = new URLSearchParams(window.location.search).get('code');
        if (code && !isAdminMode) {
            window.history.replaceState({}, '', '/');
            handleFeishuLogin(code);
        }
    }, [isAdminMode]);

    useEffect(() => {
        if (isAdminMode) refreshCaptcha();
    }, [isAdminMode]);

    const refreshCaptcha = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/captcha`);
            const data = await res.json();
            setCaptchaUrl(data.image);
            setCaptchaToken(data.token);
        } catch (e) { console.error('Captcha load failed'); }
    };

    const handleFeishuLogin = async (code: string) => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/login_feishu`, { 
                method: 'POST', 
                headers: {'Content-Type':'application/json'}, 
                body: JSON.stringify({code}) 
            });
            const data = await res.json();
            if (!res.ok) { setAlertMsg(data.error || '登录失败'); return; }
            const userData = { ...data.user, token: data.token };
            
            // 🟢 修改：存入 sessionStorage
            sessionStorage.setItem('contract_system_user', JSON.stringify(userData));
            onLoginSuccess(userData);
        } catch(e) { setAlertMsg(`网络连接失败`); } 
        finally { setLoading(false); }
    };

    const handleAdminLogin = async () => {
        if (isMfaRequired && preAuthToken) {
            if (!loginMfaCode) return setAlertMsg('请输入动态验证码');
            setLoading(true);
            try {
                const res = await fetch(`${API_BASE_URL}/login/verify_mfa`, { 
                    method: 'POST', 
                    headers: {'Content-Type':'application/json'}, 
                    body: JSON.stringify({ pre_auth_token: preAuthToken, mfa_code: loginMfaCode }) 
                });
                const data = await res.json();
                if (res.ok && data.status === 'success') {
                    const userData = { ...data.user, token: data.token, mfa_enabled: data.mfa_enabled };
                    sessionStorage.setItem('contract_system_user', JSON.stringify(userData));
                    onLoginSuccess(userData);
                } else { setAlertMsg(data.error || '验证码错误'); setLoginMfaCode(''); }
            } catch(e) { setAlertMsg('网络连接失败'); } 
            finally { setLoading(false); }
            return;
        }

        if (!captchaCode) return setAlertMsg('请输入图形验证码');
        setLoading(true);
        try {
            const body = { username: adminUser, password: adminPass, captcha_token: captchaToken, captcha_code: captchaCode };
            const res = await fetch(`${API_BASE_URL}/login_admin`, { 
                method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) 
            });
            const data = await res.json();
            
            if (res.ok) {
                if (data.status === 'setup_required') {
                    setTempUser({ ...data.user, token: data.token, mfa_enabled: data.user.mfa_enabled });
                    setShowSetupModal(true);
                } else if (data.status === 'success') {
                    const userData = { ...data.user, token: data.token, mfa_enabled: data.mfa_enabled };
                    sessionStorage.setItem('contract_system_user', JSON.stringify(userData));
                    onLoginSuccess(userData);
                } else if (data.status === 'mfa_required') {
                    setIsMfaRequired(true); setPreAuthToken(data.pre_auth_token); setAlertMsg(''); 
                }
            } else {
                setAlertMsg(data.error || '登录失败'); refreshCaptcha(); setCaptchaCode('');
            }
        } catch(e) { setAlertMsg(`网络连接失败`); } 
        finally { setLoading(false); }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleAdminLogin();
    };

    const bgStyle = { background: 'radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 100%)' };

    return (
        <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
            {alertMsg && <AlertModal message={alertMsg} onClose={()=>setAlertMsg('')}/>}
            {showSetupModal && (
                <FirstTimeSetupModal 
                    user={tempUser} 
                    onComplete={() => { setShowSetupModal(false); window.location.reload(); }} 
                    showAlert={setAlertMsg}
                />
            )}

            {isAdminMode ? (
                // 🟢 修复1: 统一宽度 w-full max-w-md，移除 zoom-in 动画
                // 🟢 修复2: 背景改为 bg-white，输入框改为白底灰边
                <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md border border-gray-200 text-center animate-in fade-in duration-300">
                    <h1 className="text-xl font-bold text-gray-800 mb-8">后台管理登录</h1>
                    
                    {!isMfaRequired ? (
                        <div onKeyDown={handleKeyDown}>
                            <input className="w-full bg-white border border-gray-300 p-3 rounded-xl text-gray-900 mb-4 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500" placeholder="管理员账号" value={adminUser} onChange={e=>setAdminUser(e.target.value)}/>
                            <input className="w-full bg-white border border-gray-300 p-3 rounded-xl text-gray-900 mb-4 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500" type="password" placeholder="密码" value={adminPass} onChange={e=>setAdminPass(e.target.value)}/>
                            <div className="flex gap-2 mb-6">
                                <input 
                                    className="flex-1 bg-white border border-gray-300 p-3 rounded-xl text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500" 
                                    placeholder="验证码" 
                                    value={captchaCode} 
                                    onChange={e=>setCaptchaCode(e.target.value)}
                                />
                                <div 
                                    className="w-32 h-12 bg-gray-50 border border-gray-200 rounded-xl overflow-hidden cursor-pointer shrink-0 flex items-center justify-center hover:bg-gray-100" 
                                    onClick={refreshCaptcha} 
                                    title="点击刷新"
                                >
                                    {captchaUrl ? <img src={captchaUrl} className="w-full h-full object-contain" /> : <div className="bg-gray-200 w-full h-full animate-pulse"/>}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mb-6 animate-in slide-in-from-right" onKeyDown={handleKeyDown}>
                            <div className="text-sm text-gray-600 mb-2 flex items-center justify-center gap-2"><Smartphone size={16}/> 请输入动态验证码 (MFA)</div>
                            <input className="w-full bg-white border border-gray-300 p-3 rounded-xl text-gray-900 text-center tracking-widest text-xl placeholder-gray-300 outline-none focus:ring-2 focus:ring-blue-500" maxLength={6} placeholder="000000" value={loginMfaCode} onChange={e=>setLoginMfaCode(e.target.value)} autoFocus/>
                        </div>
                    )}

                    <button onClick={handleAdminLogin} disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all flex justify-center items-center shadow-lg shadow-blue-200">
                        {loading ? <Loader2 className="animate-spin"/> : (isMfaRequired ? '验证并登录' : '登录')}
                    </button>
                    <button onClick={()=>setIsAdminMode(false)} className="block w-full text-xs text-gray-400 mt-6 hover:text-gray-600">返回飞书登录</button>
                </div>
            ) : (
                // 🟢 修复: 移除 zoom-in 动画
                <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 text-gray-800 relative overflow-hidden text-center animate-in fade-in duration-300">
                    <h1 className="text-2xl font-bold mb-2 text-slate-900">索贝合同附件管理系统</h1>
                    <p className="text-gray-500 text-sm mb-10">Sobey Contract Management System</p>
                    <button onClick={() => window.location.href = `https://passport.feishu.cn/suite/passport/oauth/authorize?client_id=${FEISHU_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&state=STATE`} 
                        className="w-full bg-[#00D6B9] hover:bg-[#00c2a8] text-white py-3.5 rounded-xl font-bold shadow-lg flex justify-center items-center gap-3 mb-6 transition-transform hover:scale-[1.02]">
                        <LayoutGrid size={20}/> 飞书一键登录
                    </button>
                    <button onClick={()=>setIsAdminMode(true)} className="text-xs text-gray-400 hover:text-blue-600 mt-6 inline-flex items-center gap-1"><Settings size={12}/> 管理员入口</button>
                </div>
            )}
        </div>
    );
}