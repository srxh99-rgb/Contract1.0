/// <reference types="vite/client" />

// frontend/src/api/client.ts

// 🟢 关键修改：使用 import.meta.env 读取环境变量
// 开发环境(npm run dev)下：如果没有设置 VITE_API_BASE_URL，默认回退到 http://127.0.0.1:5000/api
// 生产环境(npm run build)下：默认使用 '/api' (相对路径)，这样可以通过 Nginx 或 Flask 自身转发，避免跨域问题
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:5000/api' : '/api');

// 重定向 URI 也改为动态获取，默认为当前页面域名
export const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || window.location.origin;

export const FEISHU_APP_ID = import.meta.env.VITE_FEISHU_APP_ID || "cli_xxxxxxxx"; 

export const authFetch = async (url: string, options: RequestInit = {}) => {
    // 🟢 使用 sessionStorage
    const userStr = sessionStorage.getItem('contract_system_user');
    const token = userStr ? JSON.parse(userStr).token : '';
    
    const headers: any = { 
        ...options.headers, 
        'Authorization': `Bearer ${token}` 
    };

    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    } else {
        if(headers['Content-Type']) delete headers['Content-Type'];
    }
    
    // 如果 URL 是相对路径（以 / 开头），fetch 会自动处理
    // 如果 URL 是绝对路径（以 http 开头），fetch 也会自动处理
    try {
        const response = await fetch(url, { ...options, headers });
        
        if (response.status === 401) {
            console.warn('Token expired or invalid, logging out...');
            sessionStorage.removeItem('contract_system_user');
            // 防止无限刷新，只有在非登录页才跳转
            if (window.location.pathname !== '/') {
                window.location.href = '/';
            }
            throw new Error('Session expired');
        }
        
        return response;
    } catch (error) {
        throw error;
    }
};