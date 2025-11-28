// frontend/src/api/client.ts

export const API_BASE_URL = 'http://127.0.0.1:5000/api'; 
export const REDIRECT_URI = "http://127.0.0.1:5173"; 
export const FEISHU_APP_ID = "cli_a9ac2ab224fa1cd1"; 

export const authFetch = async (url: string, options: RequestInit = {}) => {
    // 🟢 修改：使用 sessionStorage (会话存储)
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
    
    try {
        const response = await fetch(url, { ...options, headers });
        
        if (response.status === 401) {
            console.warn('Token expired or invalid, logging out...');
            // 🟢 修改：清除 sessionStorage
            sessionStorage.removeItem('contract_system_user');
            window.location.href = '/';
            throw new Error('Session expired');
        }
        
        return response;
    } catch (error) {
        throw error;
    }
};