import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../../api/client';

interface Props {
    user: any;
    onComplete: () => void;
    showAlert: (msg: string) => void;
}

export const FirstTimeSetupModal: React.FC<Props> = ({ user, onComplete, showAlert }) => {
    const [step, setStep] = useState(1);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [qrData, setQrData] = useState<{secret: string, qr_code: string} | null>(null);
    const [mfaCode, setMfaCode] = useState('');
    const [loadingQr, setLoadingQr] = useState(false);
    
    const isMfaBound = user.mfa_enabled;

    useEffect(() => {
        if(step === 2 && !isMfaBound && !qrData && !loadingQr) {
            setLoadingQr(true);
            fetch(`${API_BASE_URL}/admin/mfa/generate?t=${Date.now()}`, {
                headers: { 'Authorization': `Bearer ${user.token}` }
            })
            .then(async res => {
                if(res.ok) setQrData(await res.json());
                else {
                    const d = await res.json();
                    showAlert(d.error || '获取二维码失败');
                }
            })
            .catch(() => showAlert('网络连接失败'))
            .finally(() => setLoadingQr(false));
        }
    }, [step, user, isMfaBound]);

    const handleNext = async () => {
        if(newPassword !== confirmPassword) return showAlert('两次输入的密码不一致');
        if(newPassword.length < 8) return showAlert('密码长度不能少于 8 位');
        
        try {
            const res = await fetch(`${API_BASE_URL}/admin/check_password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
                body: JSON.stringify({ password: newPassword })
            });
            const d = await res.json();
            if (!res.ok) return showAlert(d.error || '密码校验失败');
        } catch (e) {
            return showAlert('网络错误');
        }

        if (isMfaBound) {
            submitSetup({});
        } else {
            setStep(2);
        }
    };

    const submitSetup = async (extraData: any) => {
        try {
            const body = { password: newPassword, ...extraData };
            const res = await fetch(`${API_BASE_URL}/admin/complete_setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
                body: JSON.stringify(body)
            });
            const d = await res.json();
            if(res.ok) {
                showAlert('设置成功，请重新登录'); 
                setTimeout(onComplete, 1500);
            } else {
                showAlert(d.error || '设置失败');
            }
        } catch(e) { showAlert('请求失败'); }
    };

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[900]">
            <div className="bg-white p-8 rounded-2xl w-[450px] shadow-2xl animate-in fade-in duration-200">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">首次登录设置</h2>
                <p className="text-gray-500 text-sm mb-6">为了您的账号安全，请完成以下设置</p>
                
                {step === 1 ? (
                    <div className="space-y-4">
                        <div className="font-bold text-blue-600 border-b pb-2 mb-4">
                            {isMfaBound ? "修改初始密码 (已绑定MFA)" : "第一步：修改初始密码"}
                        </div>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">新密码</label>
                            <input className="w-full border rounded px-3 py-2 bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-blue-200" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="8位以上，含大小写字母及符号"/>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">确认密码</label>
                            <input className="w-full border rounded px-3 py-2 bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-blue-200" type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="再次输入新密码"/>
                        </div>
                        <button onClick={handleNext} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 mt-4 transition-colors">
                            {isMfaBound ? "完成设置" : "下一步"}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="font-bold text-purple-600 border-b pb-2 mb-4">第二步：绑定 MFA</div>
                        {qrData ? (
                            <div className="text-center">
                                <div className="bg-white p-2 border inline-block mb-4 rounded-lg shadow-sm">
                                    <img src={qrData.qr_code} className="w-40 h-40"/>
                                </div>
                                <p className="text-xs text-gray-500 mb-3">请使用 Authenticator App 扫描上方二维码</p>
                                <input className="w-full border rounded px-3 py-2 text-center text-xl tracking-widest bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-purple-200 font-mono" maxLength={6} placeholder="000000" value={mfaCode} onChange={e=>setMfaCode(e.target.value)}/>
                            </div>
                        ) : <div className="text-center py-10"><Loader2 className="animate-spin mx-auto text-purple-600"/></div>}
                        
                        <button onClick={() => submitSetup({ mfa_secret: qrData?.secret, mfa_code: mfaCode })} className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 mt-4 transition-colors">完成绑定</button>
                    </div>
                )}
            </div>
        </div>
    );
};