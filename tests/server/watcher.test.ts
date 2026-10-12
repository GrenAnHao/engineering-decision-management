import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
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

test('连续写盘在 debounce 窗口内合并为一次回调，含新建子目录', async () => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  let calls = 0;
  handle = watchNotes(tmp.dir, { debounceMs: 150, onChange: () => (calls += 1), onError: () => {} });
  await sleep(100);

  mkdirSync(join(tmp.dir, 'implemented', 'feature'), { recursive: true });
  writeFileSync(join(tmp.dir, 'implemented', 'feature', 'a.md'), 'a');
  writeFileSync(join(tmp.dir, 'implemented', 'feature', 'a.md'), 'aa');
  writeFileSync(join(tmp.dir, 'implemented', 'feature', 'b.md'), 'b');

  await sleep(600);
  expect(calls).toBe(1);
});

test('close 之后不再回调（计时器已在等待中）', async () => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  let calls = 0;
  handle = watchNotes(tmp.dir, { debounceMs: 300, onChange: () => (calls += 1), onError: () => {} });
  await sleep(100);
  writeFileSync(join(tmp.dir, 'x.md'), 'x');
  await sleep(80);
  handle.close();
  await sleep(500);
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
  await sleep(400);
  expect(errors.map((e) => e.message)).toEqual(['rescan failed']);
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
  expect(calls).toBeGreaterThanOrEqual(1);
});
