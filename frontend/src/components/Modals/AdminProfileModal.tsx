import React, { useState } from 'react';
import { Smartphone, X, Check } from 'lucide-react';
import { authFetch, API_BASE_URL } from '../../api/client';

interface Props {
    onClose: () => void;
    showAlert: (msg: string) => void;
    user: any;
}

export const AdminProfileModal: React.FC<Props> = ({ onClose, showAlert, user }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [mfaEnabled, setMfaEnabled] = useState(user?.mfa_enabled || false);
    
    const [mfaStep, setMfaStep] = useState<'init' | 'qr' | 'verify'>('init');
    const [qrData, setQrData] = useState<{secret: string, qr_code: string} | null>(null);
    const [mfaCode, setMfaCode] = useState('');

    const handleSaveProfile = async () => {
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/update_profile`, {
                method: 'POST', body: JSON.stringify({ username, password })
            });
            if (res.ok) { showAlert('信息更新成功，请重新登录'); onClose(); }
            else { const d = await res.json(); showAlert(d.error || '更新失败'); }
        } catch (e) { showAlert('网络错误'); }
    };

    const handleGenerateMFA = async () => {
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/mfa/generate?t=${Date.now()}`);
            setQrData(await res.json());
            setMfaStep('qr');
        } catch (e) { showAlert('生成二维码失败'); }
    };

    const handleBindMFA = async () => {
        if(!qrData || !mfaCode) return;
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/mfa/bind`, {
                method: 'POST', body: JSON.stringify({ secret: qrData.secret, code: mfaCode })
            });
            if(res.ok) { 
                setMfaEnabled(true); setMfaStep('init'); showAlert('MFA 绑定成功');
                const currentUser = JSON.parse(sessionStorage.getItem('contract_system_user') || '{}');
                currentUser.mfa_enabled = true;
                sessionStorage.setItem('contract_system_user', JSON.stringify(currentUser));
            } else { showAlert('验证码错误'); }
        } catch (e) { showAlert('绑定失败'); }
    };

    const handleUnbindMFA = async () => {
        if(!confirm('确定要解绑当前账号的 MFA 吗？')) return;
        try {
            const res = await authFetch(`${API_BASE_URL}/admin/mfa/unbind`, {
                method: 'POST', body: JSON.stringify({ user_id: user.id })
            });
            if(res.ok) {
                setMfaEnabled(false); showAlert('MFA 已解绑');
                const currentUser = JSON.parse(sessionStorage.getItem('contract_system_user') || '{}');
                currentUser.mfa_enabled = false;
                sessionStorage.setItem('contract_system_user', JSON.stringify(currentUser));
            }
        } catch(e) { showAlert('解绑失败'); }
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[900]">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-[500px] animate-in fade-in duration-200">
                <div className="flex justify-between items-center mb-4 border-b pb-3">
                    <h3 className="font-bold text-lg text-gray-800">管理员设置</h3>
                    <button onClick={onClose}><X className="text-gray-400" size={20}/></button>
                </div>
                <div className="space-y-6">
                    <div className="space-y-3">
                        <h4 className="font-bold text-sm text-gray-500 uppercase">修改密码</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs text-gray-500 mb-1">新用户名</label><input className="w-full border rounded px-3 py-2 text-sm" placeholder="留空不修改" value={username} onChange={e=>setUsername(e.target.value)}/></div>
                            <div><label className="block text-xs text-gray-500 mb-1">新密码</label><input className="w-full border rounded px-3 py-2 text-sm" type="password" placeholder="留空不修改" value={password} onChange={e=>setPassword(e.target.value)}/></div>
                        </div>
                        <div className="text-right"><button onClick={handleSaveProfile} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded">保存基本信息</button></div>
                    </div>

                    <div className="space-y-3 border-t pt-4">
                        <h4 className="font-bold text-sm text-gray-500 uppercase flex items-center gap-2"><Smartphone size={16}/> 多因子认证 (MFA)</h4>
                        {mfaEnabled ? (
                            <div className="bg-green-50 border border-green-100 rounded-lg p-4 flex justify-between items-center">
                                <div className="flex items-center gap-2 text-green-700 font-medium"><Check size={18}/> 已开启 MFA 保护</div>
                                <button onClick={handleUnbindMFA} className="text-xs text-red-500 hover:underline">解绑 MFA</button>
                            </div>
                        ) : (
                            <div>
                                {mfaStep === 'init' && (
                                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 flex justify-between items-center">
                                        <div className="text-orange-700 text-sm">未绑定 MFA，建议立即绑定。</div>
                                        <button onClick={handleGenerateMFA} className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-700">立即绑定</button>
                                    </div>
                                )}
                                {mfaStep === 'qr' && qrData && (
                                    <div className="bg-gray-50 p-4 rounded-lg border text-center">
                                        <img src={qrData.qr_code} alt="MFA QR" className="w-32 h-32 mx-auto mb-3 border bg-white p-1"/>
                                        <div className="flex gap-2 justify-center">
                                            <input className="border rounded px-3 py-1 w-32 text-center" maxLength={6} value={mfaCode} onChange={e=>setMfaCode(e.target.value)} placeholder="000000"/>
                                            <button onClick={handleBindMFA} className="bg-green-600 text-white px-3 py-1 rounded text-xs">验证</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};