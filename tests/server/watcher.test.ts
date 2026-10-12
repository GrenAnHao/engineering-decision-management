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

test('close 之后不再回调', async () => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  let calls = 0;
  handle = watchNotes(tmp.dir, { debounceMs: 50, onChange: () => (calls += 1), onError: () => {} });
  await sleep(100);
  writeFileSync(join(tmp.dir, 'x.md'), 'x');
  handle.close();
  await sleep(300);
  expect(calls).toBe(0);
});

test('目录不存在时同步抛错', () => {
  expect(() => watchNotes('Z:/missing/notes', { debounceMs: 10, onChange: () => {}, onError: () => {} })).toThrow();
});
