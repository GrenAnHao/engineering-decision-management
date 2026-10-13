import { afterEach, expect, test } from 'bun:test';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebAssets, scanWebDir } from '../../src/server/static';
import { makeTempDir, writeFiles } from '../helpers/fixture';

let cleanup = () => {};
afterEach(() => cleanup());

/** 在临时目录里摆一份 vite build 风格的产物，再放一个 web 目录之外的"机密"文件 */
function makeWebDir(): string {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  writeFiles(tmp.dir, {
    'secret.txt': 'TOP-SECRET',
    'web/index.html': '<!doctype html><title>t</title>',
    'web/assets/app-abc123.js': 'console.log(1)',
    'web/assets/style-abc123.css': 'body{}',
    'web/assets/font-abc123.woff2': 'wOF2',
    'web/favicon.svg': '<svg/>',
  });
  return join(tmp.dir, 'web');
}

async function loadFrom(web: string) {
  return loadWebAssets(scanWebDir(web)!);
}

const get = (url: string, method = 'GET') => new Request(`http://127.0.0.1:5173${url}`, { method });

test('scanWebDir 递归列出文件，键为以 / 开头的 URL 路径', () => {
  const web = makeWebDir();
  const files = scanWebDir(web)!;
  expect([...files.keys()].sort()).toEqual([
    '/assets/app-abc123.js',
    '/assets/font-abc123.woff2',
    '/assets/style-abc123.css',
    '/favicon.svg',
    '/index.html',
  ]);
  expect(files.get('/index.html')).toBe(join(web, 'index.html'));
});

test('scanWebDir：目录不存在或缺少 index.html 时返回 null（按仅 API 模式处理）', () => {
  const web = makeWebDir();
  expect(scanWebDir(join(web, 'nope'))).toBeNull();
  expect(scanWebDir(join(web, 'assets'))).toBeNull();
});

test('根路径返回 index.html，且不缓存', async () => {
  const assets = await loadFrom(makeWebDir());
  const res = (await assets.serve(get('/')))!;
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toStartWith('text/html');
  expect(res.headers.get('cache-control')).toBe('no-cache');
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(await res.text()).toContain('<title>t</title>');
});

test('带指纹的 /assets/ 文件按类型返回，并允许长期缓存', async () => {
  const assets = await loadFrom(makeWebDir());
  const js = (await assets.serve(get('/assets/app-abc123.js')))!;
  expect(js.headers.get('content-type')).toStartWith('text/javascript');
  expect(js.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  expect(await js.text()).toBe('console.log(1)');
  expect((await assets.serve(get('/assets/style-abc123.css')))!.headers.get('content-type')).toStartWith('text/css');
  expect((await assets.serve(get('/assets/font-abc123.woff2')))!.headers.get('content-type')).toBe('font/woff2');
});

test('同一个资源可以被反复请求（内存里的正文不会被消耗）', async () => {
  const assets = await loadFrom(makeWebDir());
  for (let i = 0; i < 3; i++) {
    expect(await (await assets.serve(get('/assets/app-abc123.js')))!.text()).toBe('console.log(1)');
  }
});

test('不在 /assets/ 下的文件（如 favicon）不设长期缓存', async () => {
  const assets = await loadFrom(makeWebDir());
  const res = (await assets.serve(get('/favicon.svg')))!;
  expect(res.headers.get('cache-control')).toBe('no-cache');
});

test('未知路径返回 null，由调用方回 404', async () => {
  const assets = await loadFrom(makeWebDir());
  expect(await assets.serve(get('/nope.js'))).toBeNull();
  expect(await assets.serve(get('/assets/'))).toBeNull();
  expect(await assets.serve(get('/assets'))).toBeNull();
});

test('路径穿越尝试拿不到 web 目录之外的文件', async () => {
  const assets = await loadFrom(makeWebDir());
  for (const url of [
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/assets/../../secret.txt',
    '/assets/%2e%2e/%2e%2e/secret.txt',
    '/..%2fsecret.txt',
    '/assets/..%5c..%5csecret.txt',
    '/%00',
    '/%E0%A4%A',
  ]) {
    expect(await assets.serve(get(url))).toBeNull();
  }
});

test('HEAD 只返回头，没有正文；其他方法返回 405', async () => {
  const assets = await loadFrom(makeWebDir());
  const head = (await assets.serve(get('/assets/app-abc123.js', 'HEAD')))!;
  expect(head.status).toBe(200);
  expect(head.headers.get('content-length')).toBe('14');
  expect(head.headers.get('content-type')).toStartWith('text/javascript');
  expect(await head.text()).toBe('');
  const post = (await assets.serve(get('/', 'POST')))!;
  expect(post.status).toBe(405);
  expect(post.headers.get('allow')).toBe('GET, HEAD');
});

test('产物在加载时读入内存：之后目录被重新构建（旧文件删除、入口换新）也不影响正在运行的服务', async () => {
  const web = makeWebDir();
  const assets = await loadFrom(web);
  // 模拟 bun run build 在服务运行期间清空并重写 dist/web：入口指向新的指纹文件，旧文件消失
  rmSync(join(web, 'assets', 'app-abc123.js'));
  writeFileSync(join(web, 'index.html'), '<script src="/assets/app-NEW.js"></script>');
  const index = (await assets.serve(get('/')))!;
  expect(await index.text()).toContain('<title>t</title>'); // 仍是加载时的入口，与它引用的资源一致
  const js = (await assets.serve(get('/assets/app-abc123.js')))!;
  expect(js.status).toBe(200);
  expect(await js.text()).toBe('console.log(1)');
});

test('加载时文件已不存在则直接报错，而不是带着缺口启动', async () => {
  const web = makeWebDir();
  const files = scanWebDir(web)!;
  rmSync(join(web, 'favicon.svg'));
  await expect(loadWebAssets(files)).rejects.toThrow('favicon.svg');
});
