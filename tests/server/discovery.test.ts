import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { allocateId, discoverProjects, pathKey, resolveProjects } from '../../src/server/discovery';
import { makeProject, makeTempDir, note } from '../helpers/fixture';

let cleanup = () => {};
afterEach(() => cleanup());

describe('discoverProjects', () => {
  test('按深度找含 .agents/notes 的目录，跳过 . 开头与 node_modules，不深入已命中的项目', async () => {
    const tmp = makeTempDir();
    cleanup = tmp.cleanup;
    const n = { 'implemented/feature/2026-01-01-a.md': note('a') };
    makeProject(tmp.dir, 'A', n);
    makeProject(join(tmp.dir, 'group'), 'B', n);
    makeProject(join(tmp.dir, 'group', 'deeper'), 'C', n);
    makeProject(join(tmp.dir, '.hidden'), 'D', n);
    makeProject(join(tmp.dir, 'node_modules'), 'E', n);
    makeProject(join(tmp.dir, 'A'), 'nested', n);
    mkdirSync(join(tmp.dir, 'empty'));

    const found = (await discoverProjects([tmp.dir], 2)).map((p) => p.slice(tmp.dir.length + 1).replaceAll('\\', '/')).sort();
    expect(found).toEqual(['A', 'group/B']);
  });

  test('扫描根不存在时返回空数组', async () => {
    expect(await discoverProjects(['Z:/missing/root'], 2)).toEqual([]);
  });
});

describe('resolveProjects', () => {
  test('发现项与配置项按路径合并：source 看是否被发现，名称/隐藏取配置', () => {
    const specs = resolveProjects(
      ['D:/Root/Pi', 'D:/Root/gren-ssh'],
      [
        { path: 'd:/root/pi', name: '派', hidden: true },
        { path: 'E:/Other/manual-proj', name: null, hidden: false },
      ],
    );
    expect(specs.map((s) => [s.folderName, s.displayName, s.source, s.hidden])).toEqual([
      ['Pi', '派', 'discovered', true],
      ['gren-ssh', 'gren-ssh', 'discovered', false],
      ['manual-proj', 'manual-proj', 'manual', false],
    ]);
    expect(specs[0]!.path).toBe(resolve('D:/Root/Pi'));
    expect(specs[0]!.key).toBe(pathKey('D:/Root/Pi'));
  });
});

describe('allocateId', () => {
  test('冲突时追加序号，大小写不敏感', () => {
    expect(allocateId('Pi', new Set())).toBe('Pi');
    expect(allocateId('Pi', new Set(['pi', 'Pi-2']))).toBe('Pi-3');
  });
});
