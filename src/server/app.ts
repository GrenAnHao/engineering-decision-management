import type { HTMLBundle } from 'bun';
import { createApiRoutes, json } from './api';
import type { Hub } from './hub';

export type ServerOptions = {
  hub: Hub;
  port: number;
  /** 前端入口；测试时省略，只起 API */
  index?: HTMLBundle;
  development?: boolean;
};

/** 组装 Bun.serve：API + SSE + 前端，只绑定 127.0.0.1 */
export function createServer(opts: ServerOptions) {
  return Bun.serve({
    hostname: '127.0.0.1',
    port: opts.port,
    // Windows 上 Bun 默认允许多个进程绑定同一端口，会让两个实例静默分流请求
    reusePort: false,
    development: opts.development ? { hmr: true, console: true } : false,
    routes: {
      ...createApiRoutes(opts.hub),
      '/': opts.index ?? new Response('前端未挂载（仅 API 模式）', { status: 404 }),
    },
    fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname.startsWith('/api/')) return json({ error: `未知接口：${pathname}` }, 404);
      return new Response('Not Found', { status: 404 });
    },
  });
}
