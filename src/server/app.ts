import { createApiRoutes, json } from './api';
import type { Hub } from './hub';
import type { WebAssets } from './static';

export type ServerOptions = {
  hub: Hub;
  port: number;
  /** 前端产物（vite build 的输出）；省略时只起 API，测试与开发模式都是这样 */
  web?: WebAssets;
};

/** 组装 Bun.serve：API + SSE + 前端静态文件，只绑定 127.0.0.1 */
export function createServer(opts: ServerOptions) {
  return Bun.serve({
    hostname: '127.0.0.1',
    port: opts.port,
    // Windows 上 Bun 在 development: false 时默认允许多个进程绑定同一端口（生产模式会静默分流请求），显式关闭
    reusePort: false,
    development: false,
    routes: createApiRoutes(opts.hub),
    fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname.startsWith('/api/')) return json({ error: `未知接口：${pathname}` }, 404);
      if (!opts.web) return new Response('前端未挂载（仅 API 模式）', { status: 404 });
      return opts.web.serve(req) ?? new Response('Not Found', { status: 404 });
    },
  });
}
