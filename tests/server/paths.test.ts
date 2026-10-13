import { expect, test } from 'bun:test';
import { join, resolve } from 'node:path';
import { isCompiled, resolveAppDir } from '../../src/server/paths';

test('源码运行时，应用目录是仓库根（src/server 的上两级）', () => {
  const moduleDir = join('D:', 'repo', 'src', 'server');
  expect(isCompiled(moduleDir)).toBe(false);
  expect(resolveAppDir(moduleDir, 'C:/bun/bun.exe')).toBe(resolve(moduleDir, '..', '..'));
});

test('编译为单体可执行文件后，应用目录是 exe 所在目录', () => {
  expect(isCompiled('B:\\~BUN\\root')).toBe(true);
  expect(isCompiled('/$bunfs/root')).toBe(true);
  expect(isCompiled('D:\\work\\~BUNDLE\\src\\server')).toBe(false);
  expect(isCompiled('B:/~BUN/root')).toBe(true);
  expect(resolveAppDir('B:\\~BUN\\root', join('D:', 'tools', 'decision-hub.exe'))).toBe(join('D:', 'tools'));
});
