// 源码运行的入口（bun run dev / bun run start）；单体可执行文件的入口由 scripts/build.ts 生成，见 scripts/embed-entry.ts
import { join } from 'node:path';
import { appDir, boot } from './boot';
import { loadWebAssets, scanWebDir, type WebAssets } from './static';

const apiOnly = process.argv.includes('--api-only');

async function loadWeb(): Promise<WebAssets> {
  const files = scanWebDir(join(appDir, 'dist', 'web'));
  if (!files) {
    console.error('[启动失败] 未找到前端产物 dist/web：请先运行 bun run build:web（bun run start 会自动构建）');
    process.exit(1);
  }
  return loadWebAssets(files);
}

await boot({ web: apiOnly ? null : await loadWeb(), apiOnly });
