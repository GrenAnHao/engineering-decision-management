import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { watchNotes, type WatchHandle } from '../../src/server/watcher';
import { makeTempDir } from '../helpers/fixture';

let cleanup = () => {};
let handle: WatchHandle | null = null;
afterEach(() => {
  handle?.close();
  handle = null;
  cleanup();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const waitUntil = async (cond: () => boolean, timeoutMs = 3000) => {
  const end = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > end) throw new Error('waitUntil 超时');
    await sleep(20);
  }
};

test('连续写盘在 debounce 窗口内合并为一次回调，含新建子目录', async () => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  let calls = 0;
  handle = watchNotes(tmp.dir, { debounceMs: 500, maxWaitMs: 5000, onChange: () => (calls += 1), onError: () => {} });
  await sleep(100);

  mkdirSync(join(tmp.dir, 'implemented', 'feature'), { recursive: true });
  writeFileSync(join(tmp.dir, 'implemented', 'feature', 'a.md'), 'a');
  writeFileSync(join(tmp.dir, 'implemented', 'feature', 'a.md'), 'aa');
  writeFileSync(join(tmp.dir, 'implemented', 'feature', 'b.md'), 'b');

  await waitUntil(() => calls >= 1);
  await sleep(1000);
  expect(calls).toBe(1);
});

test('close 之后不再回调（计时器已在等待中）', async () => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  let calls = 0;
  handle = watchNotes(tmp.dir, { debounceMs: 1000, onChange: () => (calls += 1), onError: () => {} });
  await sleep(100);
  writeFileSync(join(tmp.dir, 'x.md'), 'x');
  await sleep(80);
  handle.close();
  await sleep(1500);
  expect(calls).toBe(0);
});

test('onChange 抛错转交 onError，不抛出到进程', async () => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  const errors: Error[] = [];
  handle = watchNotes(tmp.dir, {
    debounceMs: 50,
    onChange: () => {
      throw new Error('rescan failed');
    },
    onError: (err) => errors.push(err),
  });
  await sleep(100);
  writeFileSync(join(tmp.dir, 'y.md'), 'y');
  await waitUntil(() => errors.length > 0);
  expect(errors.length).toBeGreaterThanOrEqual(1);
  expect(errors.every((e) => e.message === 'rescan failed')).toBe(true);
});

test('目录不存在时同步抛错', () => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  expect(() => watchNotes(join(tmp.dir, 'missing'), { debounceMs: 10, onChange: () => {}, onError: () => {} })).toThrow();
});

test('事件持续不断时，最多等 maxWaitMs 也会触发一次', async () => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  let calls = 0;
  handle = watchNotes(tmp.dir, { debounceMs: 200, maxWaitMs: 300, onChange: () => (calls += 1), onError: () => {} });
  await sleep(100);
  const deadline = Date.now() + 800;
  let i = 0;
  while (Date.now() < deadline) {
    writeFileSync(join(tmp.dir, `s${i++ % 3}.md`), String(i));
    await sleep(40);
  }
  await waitUntil(() => calls >= 1, 3000);
  expect(calls).toBeGreaterThanOrEqual(1);
});

test('根目录被删除并重建时自行关闭并报错', async () => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  const root = join(tmp.dir, 'notes');
  mkdirSync(root);
  const errors: Error[] = [];
  handle = watchNotes(root, { debounceMs: 50, maxWaitMs: 200, onChange: () => {}, onError: (e) => errors.push(e) });
  await sleep(100);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root);
  await waitUntil(() => errors.length > 0, 5000);
  expect(errors[0]!.message).toContain('已被删除或替换');
});
