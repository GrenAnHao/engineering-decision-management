import { readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { ProjectSource } from '../shared/types';
import type { ProjectEntry } from './config';
import { notesDir } from './scan';

const SKIP_DIRS = new Set(['node_modules']);

/** 路径对账键：绝对化，Windows 下不区分大小写 */
export function pathKey(path: string): string {
  const abs = resolve(path);
  return process.platform === 'win32' ? abs.toLowerCase() : abs;
}

export async function hasNotesDir(dir: string): Promise<boolean> {
  try {
    return (await stat(notesDir(dir))).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 在扫描根下找含 .agents/notes 的目录。根本身深度为 0，子目录逐级 +1，深度 ≤ maxDepth。
 * 命中项目后不再深入其子目录；跳过 . 开头目录与 node_modules；读不了的目录静默跳过。
 */
export async function discoverProjects(roots: readonly string[], maxDepth: number): Promise<string[]> {
  const found = new Map<string, string>();

  async function visit(dir: string, depth: number): Promise<void> {
    if (await hasNotesDir(dir)) {
      found.set(pathKey(dir), dir);
      return;
    }
    if (depth >= maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      await visit(join(dir, entry.name), depth + 1);
    }
  }

  for (const root of roots) await visit(resolve(root), 0);
  return [...found.values()];
}

export type ProjectSpec = {
  key: string;
  path: string;
  folderName: string;
  displayName: string;
  source: ProjectSource;
  hidden: boolean;
};

/**
 * 合并「自动发现」与「config.projects」。
 * 同一路径两边都有时只保留一项：source 仍按是否被发现判定，名称/隐藏取配置条目（配置优先）。
 * 只出现在配置里的为 manual。
 */
export function resolveProjects(discovered: readonly string[], entries: readonly ProjectEntry[]): ProjectSpec[] {
  const specs = new Map<string, ProjectSpec>();
  const make = (path: string, source: ProjectSource, entry?: ProjectEntry): ProjectSpec => {
    const abs = resolve(path);
    const folderName = basename(abs) || abs;
    return {
      key: pathKey(abs),
      path: abs,
      folderName,
      displayName: entry?.name ?? folderName,
      source,
      hidden: entry?.hidden ?? false,
    };
  };
  for (const path of discovered) specs.set(pathKey(path), make(path, 'discovered'));
  for (const entry of entries) {
    const key = pathKey(entry.path);
    const prev = specs.get(key);
    specs.set(key, make(prev?.path ?? entry.path, prev?.source ?? 'manual', entry));
  }
  return [...specs.values()];
}

/** 以文件夹名为 id，冲突时追加 -2、-3…（大小写不敏感） */
export function allocateId(folderName: string, taken: ReadonlySet<string>): string {
  const lowerTaken = new Set([...taken].map((t) => t.toLowerCase()));
  let id = folderName;
  for (let n = 2; lowerTaken.has(id.toLowerCase()); n += 1) id = `${folderName}-${n}`;
  return id;
}
