import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1', // 允许局域网访问
    port: 5173,
    // 🟢 开发环境代理配置
    // 这样在开发时请求 /api 会自动转发到本地后端，模拟生产环境同域部署
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist', // 构建输出目录
    assetsDir: 'assets',
    sourcemap: false, // 生产环境关闭 sourcemap 减小体积
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'lucide-react'], // 分包优化
        }
      }
    }
  }
})