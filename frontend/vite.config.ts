import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', // 允许 Nginx 转发过来的连接
    port: 5173,
    // 🟢 关键修复：将您的域名加入白名单，否则 Vite 会拒绝服务导致页面空白
    allowedHosts: [
      'uslfv3j6l1.sobey.com',
      'localhost',
      '127.0.0.1'
    ]
  }
})