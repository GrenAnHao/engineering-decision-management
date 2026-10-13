import { join, resolve } from 'node:path';
import { DEV_API_PORT, DEV_WEB_PORT } from '../shared/dev';
import { createServer } from './app';
import { Hub } from './hub';
import { resolveAppDir } from './paths';
import type { WebAssets } from './static';

/** 应用目录：编译后是 exe 所在目录，源码运行时是仓库根 */
export const appDir = resolveAppDir(import.meta.dir, process.execPath);

export type BootOptions = {
  /** 前端产物；null = 不挂前端（开发模式由 Vite 提供） */
  web: WebAssets | null;
  /** 开发模式：监听固定的开发端口，而不是 config.json 的 port */
  apiOnly?: boolean;
};

/** 读配置、扫描项目、起服务并接管退出信号；启动失败时打印可读错误并退出进程 */
export async function boot({ web, apiOnly = false }: BootOptions): Promise<void> {
  const configPath = resolve(process.env.EDM_CONFIG ?? join(appDir, 'config.json'));

  const hub = new Hub({ configPath });
  try {
    await hub.start();
  } catch (err) {
    console.error(`[启动失败] ${(err as Error).message}`);
    process.exit(1);
  }

  const port = apiOnly ? DEV_API_PORT : hub.config.current.port;
  let server: ReturnType<typeof createServer>;
  try {
    server = createServer({ hub, port, web: web ?? undefined });
  } catch (err) {
    const { code, message } = err as NodeJS.ErrnoException;
    const inUse = code === 'EADDRINUSE' || /in use/i.test(message);
    console.error(
      inUse
        ? `[启动失败] 端口 ${port} 已被占用：${apiOnly ? '请关闭占用该端口的程序' : '请修改 config.json 的 port，或关闭占用该端口的程序'}`
        : `[启动失败] ${message}`,
    );
    hub.stop();
    process.exit(1);
  }

  const summary = `${hub.listMeta().length} 个项目，配置 ${configPath}`;
  console.log(
    apiOnly
      ? `工程决策中心 API（开发模式）：http://127.0.0.1:${server.port}  （${summary}）；页面请访问 Vite：http://localhost:${DEV_WEB_PORT}`
      : `工程决策中心：http://127.0.0.1:${server.port}  （${summary}）`,
  );

  function shutdown(): void {
    hub.stop();
    void server.stop(true);
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
