import { afterEach, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConfigStore, defaultConfig, loadConfig, normalizeConfig, saveConfig } from '../../src/server/config';
import { makeTempDir } from '../helpers/fixture';

let cleanup = () => {};
afterEach(() => cleanup());

function tempConfigPath(): string {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  return join(tmp.dir, 'config.json');
}

describe('loadConfig', () => {
  test('文件不存在时返回默认值且无错误', async () => {
    const path = tempConfigPath();
    const { config, error } = await loadConfig(path);
    expect(error).toBeNull();
    expect(config).toEqual(defaultConfig(path));
    expect(config.scanRoots).toEqual([resolve(path, '..', '..')]);
  });

  test('JSON 损坏时返回默认值 + 错误，且不改动文件', async () => {
    const path = tempConfigPath();
    writeFileSync(path, '{ "port": 1,, }');
    const { config, error } = await loadConfig(path);
    expect(error).toContain('config.json 解析失败');
    expect(config.port).toBe(5173);
    expect(readFileSync(path, 'utf8')).toBe('{ "port": 1,, }');
  });

  test('合法文件按字段读取', async () => {
    const path = tempConfigPath();
    writeFileSync(path, JSON.stringify({ port: 6000, scanRoots: ['D:/x'], projects: [{ path: 'D:/y', name: ' Y ', hidden: true }] }));
    const { config } = await loadConfig(path);
    expect(config.port).toBe(6000);
    expect(config.scanRoots).toEqual(['D:/x']);
    expect(config.projects).toEqual([{ path: 'D:/y', name: 'Y', hidden: true }]);
    expect(config.watch).toEqual({ debounceMs: 150, rescanRootsMs: 60000 });
  });
});

describe('normalizeConfig', () => {
  const defaults = defaultConfig('/app/config.json');

  test('类型错误的字段回落默认值，非法项目条目被丢弃', () => {
    const config = normalizeConfig(
      { port: 'x', scanDepth: -1, projects: [{ path: '' }, { nope: 1 }, { path: 'D:/ok' }], watch: { debounceMs: 50 } },
      defaults,
    );
    expect(config.port).toBe(5173);
    expect(config.scanDepth).toBe(2);
    expect(config.projects).toEqual([{ path: 'D:/ok', name: null, hidden: false }]);
    expect(config.watch).toEqual({ debounceMs: 50, rescanRootsMs: 60000 });
  });

  test('顶层不是对象时抛错', () => {
    expect(() => normalizeConfig([], defaults)).toThrow();
  });
});

describe('saveConfig / ConfigStore.update', () => {
  test('原子写入后不残留临时文件', async () => {
    const path = tempConfigPath();
    await saveConfig(path, defaultConfig(path));
    expect(JSON.parse(readFileSync(path, 'utf8')).port).toBe(5173);
    expect(readdirSync(join(path, '..'))).toEqual(['config.json']);
  });

  test('update 先重读磁盘，保留用户手工编辑的字段', async () => {
    const path = tempConfigPath();
    const store = new ConfigStore(path);
    await store.load();
    writeFileSync(path, JSON.stringify({ port: 7000 }));
    const next = await store.update((c) => ({ ...c, projects: [...c.projects, { path: 'D:/n', name: null, hidden: false }] }));
    expect(next.port).toBe(7000);
    expect(JSON.parse(readFileSync(path, 'utf8')).projects).toHaveLength(1);
  });

  test('文件损坏时 update 拒绝写入', async () => {
    const path = tempConfigPath();
    writeFileSync(path, 'not json');
    const store = new ConfigStore(path);
    await store.load();
    expect(store.error).toContain('解析失败');
    await expect(store.update((c) => c)).rejects.toThrow('解析失败');
    expect(readFileSync(path, 'utf8')).toBe('not json');
  });

  test('并发 update 串行执行，不丢写', async () => {
    const path = tempConfigPath();
    const store = new ConfigStore(path);
    await store.load();
    await Promise.all(
      ['a', 'b', 'c'].map((p) => store.update((c) => ({ ...c, projects: [...c.projects, { path: p, name: null, hidden: false }] }))),
    );
    expect(JSON.parse(readFileSync(path, 'utf8')).projects.map((p: { path: string }) => p.path)).toEqual(['a', 'b', 'c']);
  });
});
