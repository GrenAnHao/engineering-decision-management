import { join, resolve } from 'node:path';
import index from '../client/index.html';
import { createServer } from './app';
import { Hub } from './hub';
import { checkNodeModulesSync } from './onedrive';

const appDir = resolve(import.meta.dir, '..', '..');
const configPath = resolve(process.env.EDM_CONFIG ?? join(appDir, 'config.json'));
const development = !process.argv.includes('--prod');

const hub = new Hub({ configPath });
try {
  await hub.start();
} catch (err) {
  console.error(`[启动失败] ${(err as Error).message}`);
  process.exit(1);
}

const oneDriveWarning = await checkNodeModulesSync(appDir);
if (oneDriveWarning) console.warn(`[onedrive] ${oneDriveWarning}`);

const port = hub.config.current.port;
let server: ReturnType<typeof createServer>;
try {
  server = createServer({ hub, port, index, development });
} catch (err) {
  const { code, message } = err as NodeJS.ErrnoException;
  const inUse = code === 'EADDRINUSE' || /in use/i.test(message);
  console.error(
    inUse
      ? `[启动失败] 端口 ${port} 已被占用：请修改 config.json 的 port，或关闭占用该端口的程序`
      : `[启动失败] ${message}`,
  );
  hub.stop();
  process.exit(1);
}
const projects = hub.listMeta();
console.log(`工程决策中心：http://127.0.0.1:${server.port}  （${projects.length} 个项目，配置 ${configPath}）`);

function shutdown(): void {
  hub.stop();
  void server.stop(true);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
