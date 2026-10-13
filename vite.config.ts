import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { DEV_API_PORT, DEV_WEB_PORT } from './src/shared/dev.ts';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // 与 dist/ 下的单体可执行文件、config.json 并列；服务按此目录分发前端
    outDir: 'dist/web',
    emptyOutDir: true,
  },
  server: {
    // 显式绑 IPv4：默认的 localhost 在 Node 里可能解析成 ::1，导致 127.0.0.1 打不开，
    // 也会让同端口号的服务各占 IPv4 / IPv6 一个协议栈、互相不报冲突（strictPort 失效）
    host: '127.0.0.1',
    port: DEV_WEB_PORT,
    strictPort: true,
    proxy: {
      // 不要开 changeOrigin：API 校验 Host 与 Origin 必须一致（防 DNS 重绑定 / 跨站写配置），
      // 保持浏览器发来的 Host（含 Vite 端口）才能与 Origin 对上。SSE（/api/events）同样经此代理。
      '/api': { target: `http://127.0.0.1:${DEV_API_PORT}` },
    },
  },
});
