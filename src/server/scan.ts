import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isLifecycle, type NoteDoc } from '../shared/types';
import { buildLinkIndex, resolveLinks } from './links';
import { parseNote, type ParsedNote } from './parser';

const ZH_MD_RE = /\.zh\.md$/i;

export function notesDir(projectPath: string): string {
  return join(projectPath, '.agents', 'notes');
}

/**
 * 遍历 notes 根，返回 id → 绝对路径。
 * 规则：跳过 . 开头条目；只收 .md；相对路径至少三段且首段是生命周期；
 * .zh.md 归一化为 .md，同 id 时 .zh.md 优先。根目录不存在时抛错（由调用方标记项目失效）。
 */
export async function listNoteFiles(root: string): Promise<Map<string, string>> {
  const found = new Map<string, { abs: string; zh: boolean }>();

  async function walk(dir: string, rel: string[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        try {
          await walk(abs, [...rel, entry.name]);
        } catch (err) {
          console.warn(`[scan] 无法读取目录 ${abs}: ${(err as Error).message}`);
        }
        continue;
      }
      if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;
      const zh = ZH_MD_RE.test(entry.name);
      const segs = [...rel, entry.name.replace(ZH_MD_RE, '.md')];
      if (segs.length < 3 || !isLifecycle(segs[0]!)) continue;
      const id = segs.join('/');
      if (!found.has(id) || zh) found.set(id, { abs, zh });
    }
  }

  await walk(root, []);
  return new Map([...found].map(([id, v]) => [id, v.abs]));
}

/** 码点序比较，结果与运行时 / 区域设置无关 */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 日期倒序，同日期按 id 升序；无日期的排最后 */
export function compareNotes(a: NoteDoc, b: NoteDoc): number {
  return byCodePoint(b.date, a.date) || byCodePoint(a.id, b.id);
}

export type ReadNote = (absPath: string) => Promise<string>;

const readUtf8: ReadNote = (absPath) => readFile(absPath, 'utf8');

/** 全量扫描一个 notes 根：读盘 → 解析 → 解析链接 → 排序 */
export async function scanNotes(root: string, read: ReadNote = readUtf8): Promise<{ notes: NoteDoc[]; scanMs: number }> {
  const started = performance.now();
  const files = await listNoteFiles(root);
  const parsed: ParsedNote[] = [];
  await Promise.all(
    [...files].map(async ([id, abs]) => {
      try {
        parsed.push(parseNote(await read(abs), id));
      } catch (err) {
        console.warn(`[scan] 跳过 ${abs}: ${(err as Error).message}`);
      }
    }),
  );
  parsed.sort((a, b) => byCodePoint(a.id, b.id));
  const index = buildLinkIndex(parsed.map((p) => p.id));
  const notes: NoteDoc[] = parsed.map(({ rawLinks, ...rest }) => ({
    ...rest,
    links: resolveLinks(rest.id, rawLinks, index),
  }));
  notes.sort(compareNotes);
  return { notes, scanMs: performance.now() - started };
}
