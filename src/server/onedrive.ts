import { lstat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathKey } from './discovery';

type Env = Record<string, string | undefined>;

export function oneDriveRoots(env: Env): string[] {
  return [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial].filter((v): v is string => !!v);
}

/**
 * 应用目录在 OneDrive 同步范围内、且 node_modules 是实体目录（不是指向外部的 junction/符号链接）时返回提示文案。
 * 只提示，不修改任何 OneDrive 配置。
 */
export async function checkNodeModulesSync(appDir: string, env: Env = process.env): Promise<string | null> {
  const app = pathKey(appDir);
  const inside = oneDriveRoots(env).some((root) => {
    const r = pathKey(root);
    return app === r || app.startsWith(r + sep);
  });
  if (!inside) return null;
  const nodeModules = join(appDir, 'node_modules');
  try {
    if ((await lstat(nodeModules)).isSymbolicLink()) return null;
  } catch {
    return null;
  }
  return `node_modules 位于 OneDrive 同步目录内（${nodeModules}），安装依赖会产生大量同步流量。处理方法见 README「OneDrive 注意事项」。`;
}
