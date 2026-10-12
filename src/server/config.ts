import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type ProjectEntry = { path: string; name: string | null; hidden: boolean };

export type Config = {
  port: number;
  scanRoots: string[];
  scanDepth: number;
  projects: ProjectEntry[];
  watch: { debounceMs: number; rescanRootsMs: number };
};

/** 内置默认值：扫描根默认为应用目录的上一级（即与本应用并列的各项目） */
export function defaultConfig(configPath: string): Config {
  return {
    port: 5173,
    scanRoots: [resolve(dirname(configPath), '..')],
    scanDepth: 2,
    projects: [],
    watch: { debounceMs: 150, rescanRootsMs: 60_000 },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function intInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function normalizeEntry(value: unknown): ProjectEntry | null {
  if (!isRecord(value) || typeof value.path !== 'string' || !value.path.trim()) return null;
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : null;
  return { path: value.path, name, hidden: value.hidden === true };
}

/** 逐字段校验，类型不对的字段回落默认值；顶层不是对象时抛错 */
export function normalizeConfig(input: unknown, defaults: Config): Config {
  if (!isRecord(input)) throw new Error('config.json 顶层必须是对象');
  const watch = isRecord(input.watch) ? input.watch : {};
  return {
    port: intInRange(input.port, 1, 65535, defaults.port),
    scanRoots: Array.isArray(input.scanRoots)
      ? input.scanRoots.filter((r): r is string => typeof r === 'string' && r.trim() !== '')
      : defaults.scanRoots,
    scanDepth: intInRange(input.scanDepth, 0, 10, defaults.scanDepth),
    projects: Array.isArray(input.projects)
      ? input.projects.map(normalizeEntry).filter((e): e is ProjectEntry => e !== null)
      : defaults.projects,
    watch: {
      debounceMs: intInRange(watch.debounceMs, 10, 10_000, defaults.watch.debounceMs),
      // 0 表示关闭定期重扫，必须保留
      rescanRootsMs:
        watch.rescanRootsMs === 0
          ? 0
          : intInRange(watch.rescanRootsMs, 1000, 86_400_000, defaults.watch.rescanRootsMs),
    },
  };
}

export type LoadResult = { config: Config; error: string | null };

/** 读取配置。文件不存在 → 默认值；解析失败 → 默认值 + 错误信息（绝不覆盖用户文件） */
export async function loadConfig(path: string): Promise<LoadResult> {
  const defaults = defaultConfig(path);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { config: defaults, error: null };
    return { config: defaults, error: `读取 config.json 失败：${(err as Error).message}` };
  }
  try {
    // 去掉记事本等编辑器保存的 UTF-8 BOM
    return { config: normalizeConfig(JSON.parse(text.replace(/^﻿/, '')), defaults), error: null };
  } catch (err) {
    return { config: defaults, error: `config.json 解析失败，已使用内置默认值：${(err as Error).message}` };
  }
}

const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_ATTEMPTS = 5;

/** Windows 上目标文件被 OneDrive / 杀软 / 编辑器短暂占用时 rename 会报 EPERM/EBUSY，退避重试 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (!RENAME_RETRY_CODES.has(code) || attempt >= RENAME_ATTEMPTS) throw err;
      await Bun.sleep(attempt * 40);
    }
  }
}

/** 原子写：先写同目录临时文件，再 rename 覆盖；失败时清理临时文件 */
export async function saveConfig(path: string, config: Config): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  try {
    await renameWithRetry(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

export class ConfigStore {
  current: Config;
  error: string | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(readonly path: string) {
    this.current = defaultConfig(path);
  }

  async load(): Promise<Config> {
    const { config, error } = await loadConfig(this.path);
    this.current = config;
    this.error = error;
    if (error) console.error(`[config] ${error}`);
    return config;
  }

  /**
   * 读-改-写，串行执行。每次先重读磁盘以纳入用户手工编辑；
   * 若文件此刻已损坏则拒绝写入并抛错，保护用户文件。
   * 写回的是规范化后的配置：未知字段与无效条目不会保留。
   */
  update(mutate: (config: Config) => Config): Promise<Config> {
    const run = async (): Promise<Config> => {
      const { config, error } = await loadConfig(this.path);
      if (error) throw new Error(error);
      const next = mutate(config);
      await saveConfig(this.path, next);
      this.current = next;
      this.error = null;
      return next;
    };
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => undefined);
    return result;
  }
}
