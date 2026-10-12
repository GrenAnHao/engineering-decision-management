import { join, resolve } from 'node:path';
import index from '../client/index.html';
import { createServer } from './app';
import { Hub } from './hub';
import { checkNodeModulesSync } from './onedrive';

const appDir = resolve(import.meta.dir, '..', '..');
const configPath = resolve(process.env.EDM_CONFIG ?? join(appDir, 'config.json'));
const development = !process.argv.includes('--prod');

const hub = new Hub({ configPath });
await hub.start();

const oneDriveWarning = await checkNodeModulesSync(appDir);
if (oneDriveWarning) console.warn(`[onedrive] ${oneDriveWarning}`);

const server = createServer({ hub, port: hub.config.current.port, index, development });
const projects = hub.listMeta();
console.log(`工程决策中心：http://127.0.0.1:${server.port}  （${projects.length} 个项目，配置 ${configPath}）`);

function shutdown(): void {
  hub.stop();
  void server.stop(true);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
