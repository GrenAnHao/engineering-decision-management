import { readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

/** 一份前端产物：URL 路径 → 文件路径（磁盘路径，或单体可执行文件内嵌的虚拟路径） */
export type AssetFiles = ReadonlyMap<string, string>;

export type WebAssets = {
  /** 命中前端产物则返回响应；不属于前端产物返回 null，由调用方回 404 */
  serve(req: Request): Response | null;
};

const INDEX = '/index.html';
/** vite build 把带内容指纹的产物放在 /assets/ 下，可长期缓存；其余（入口 HTML 等）每次校验 */
const FINGERPRINTED_PREFIX = '/assets/';
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** 扫描 vite build 的输出目录；目录不存在或没有 index.html 时返回 null（按仅 API 模式处理） */
export function scanWebDir(dir: string): Map<string, string> | null {
  let entries: string[];
  try {
    entries = readdirSync(dir, { recursive: true, encoding: 'utf8' });
  } catch {
    return null;
  }
  const files = new Map<string, string>();
  for (const rel of entries) {
    const abs = join(dir, rel);
    try {
      if (statSync(abs).isFile()) files.set(`/${rel.split(sep).join('/')}`, abs);
    } catch {
      // 扫描期间被删除的文件直接忽略
    }
  }
  return files.has(INDEX) ? files : null;
}

/** 请求路径 → 产物键；只做表查找，不把请求路径拼进文件系统路径，所以无从穿越 */
function toAssetKey(pathname: string): string | null {
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded === '/' ? INDEX : decoded;
  } catch {
    return null;
  }
}

type Asset = { body: ArrayBuffer; type: string };

/**
 * 把前端产物整体读入内存（约几百 KB）。内存里是一份自洽的快照：服务运行期间 dist/web 被重新构建
 * （文件名里的指纹全变、旧文件被清空）也不会出现「入口是新的、资源已 404」的白屏；要换新版本就重启服务。
 * 任何一个文件读不出来都直接抛错，而不是带着缺口启动。
 */
export async function loadWebAssets(files: AssetFiles): Promise<WebAssets> {
  const assets = new Map<string, Asset>();
  for (const [key, path] of files) {
    const file = Bun.file(path);
    try {
      assets.set(key, { body: await file.arrayBuffer(), type: file.type });
    } catch (err) {
      throw new Error(`读取前端产物失败：${path}`, { cause: err });
    }
  }

  return {
    serve(req) {
      const key = toAssetKey(new URL(req.url).pathname);
      const asset = key === null ? undefined : assets.get(key);
      if (key === null || !asset) return null;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      const headers = {
        'Content-Type': asset.type,
        'Cache-Control': key.startsWith(FINGERPRINTED_PREFIX) ? IMMUTABLE : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      };
      if (req.method === 'HEAD') {
        return new Response(null, { headers: { ...headers, 'Content-Length': String(asset.body.byteLength) } });
      }
      return new Response(asset.body, { headers });
    },
  };
}
