import { afterEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { createServer } from '../../src/server/app';
import { Hub } from '../../src/server/hub';
import { loadWebAssets, scanWebDir } from '../../src/server/static';
import { makeTempDir, writeFiles } from '../helpers/fixture';

let cleanup = () => {};
afterEach(() => cleanup());

test('端口已被占用时 createServer 抛 EADDRINUSE（生产模式 development: false）', async () => {
  const tmp = makeTempDir();
  const hub = new Hub({ configPath: join(tmp.dir, 'config.json'), heartbeatMs: 60_000 });
  const first = createServer({ hub, port: 0 });
  cleanup = () => {
    first.stop(true);
    hub.stop();
    tmp.cleanup();
  };
  let error: (Error & { code?: string }) | null = null;
  try {
    createServer({ hub, port: first.port as number }).stop(true);
  } catch (err) {
    error = err as Error & { code?: string };
  }
  expect(error?.code).toBe('EADDRINUSE');
});

/** 起一个（可选）挂载了前端产物的服务，返回基址 */
async function startServer(withWeb: boolean): Promise<string> {
  const tmp = makeTempDir();
  writeFiles(tmp.dir, {
    'web/index.html': '<!doctype html><title>hub</title>',
    'web/assets/app-abc.js': 'console.log(1)',
  });
  const hub = new Hub({ configPath: join(tmp.dir, 'config.json'), heartbeatMs: 60_000 });
  const web = withWeb ? await loadWebAssets(scanWebDir(join(tmp.dir, 'web'))!) : undefined;
  const server = createServer({ hub, port: 0, web });
  cleanup = () => {
    server.stop(true);
    hub.stop();
    tmp.cleanup();
  };
  return `http://127.0.0.1:${server.port}`;
}

test('挂载前端产物后：/ 返回入口 HTML，/assets/ 下的文件按类型返回', async () => {
  const base = await startServer(true);
  const index = await fetch(`${base}/`);
  expect(index.status).toBe(200);
  expect(index.headers.get('content-type')).toStartWith('text/html');
  expect(await index.text()).toContain('<title>hub</title>');
  const js = await fetch(`${base}/assets/app-abc.js`);
  expect(js.headers.get('content-type')).toStartWith('text/javascript');
});

test('挂载前端产物后：未知路径 404，未知 API 仍返回 JSON 404', async () => {
  const base = await startServer(true);
  expect((await fetch(`${base}/nope`)).status).toBe(404);
  const api = await fetch(`${base}/api/nope`);
  expect(api.status).toBe(404);
  expect(await api.json()).toEqual({ error: '未知接口：/api/nope' });
});

test('没有前端产物（仅 API 模式）时 / 返回 404 说明', async () => {
  const base = await startServer(false);
  const res = await fetch(`${base}/`);
  expect(res.status).toBe(404);
  expect(await res.text()).toContain('前端未挂载');
});
