import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { listNoteFiles, notesDir, scanNotes } from '../../src/server/scan';
import { makeProject, makeTempDir, note } from '../helpers/fixture';

let cleanup = () => {};
afterEach(() => cleanup());

function setup(notes: Record<string, string>): string {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  return notesDir(makeProject(tmp.dir, 'proj', notes));
}

describe('listNoteFiles', () => {
  test('只收三段以上、首段为生命周期的 .md，跳过 . 开头条目', async () => {
    const root = setup({
      'implemented/architecture/2026-01-01-a.md': note('a'),
      'implemented/architecture/deep/2026-01-02-b.md': note('b'),
      'implemented/README.md': 'two segments',
      'drafts/feature/2026-01-03-c.md': note('c'),
      'proposed/.gitkeep': '',
      'proposed/feature/.hidden.md': note('h'),
      '.trash/implemented/feature/x.md': note('x'),
      'implemented/feature/notes.txt': 'not md',
    });
    const ids = [...(await listNoteFiles(root)).keys()].sort();
    expect(ids).toEqual(['implemented/architecture/2026-01-01-a.md', 'implemented/architecture/deep/2026-01-02-b.md']);
  });

  test('.zh.md 归一化为 .md，同 id 时以 .zh.md 为准', async () => {
    const root = setup({
      'implemented/feature/2026-01-01-a.md': note('english'),
      'implemented/feature/2026-01-01-a.zh.md': note('中文'),
      'implemented/feature/2026-01-02-b.zh.md': note('仅中文'),
    });
    const files = await listNoteFiles(root);
    expect([...files.keys()].sort()).toEqual(['implemented/feature/2026-01-01-a.md', 'implemented/feature/2026-01-02-b.md']);
    expect(files.get('implemented/feature/2026-01-01-a.md')).toEndWith('2026-01-01-a.zh.md');
  });

  test('notes 根不存在时抛错', async () => {
    await expect(listNoteFiles('Z:/definitely/missing/notes')).rejects.toThrow();
  });
});

describe('scanNotes', () => {
  test('解析全部笔记、解析链接并按日期倒序', async () => {
    const root = setup({
      'implemented/architecture/2026-01-01-base.md': note('基础'),
      'implemented/feature/2026-02-01-child.md': note('子', 'implemented', '## Decision\n\n依赖 [基础](../architecture/2026-01-01-base.md)\n'),
      'proposed/feature/2026-03-01-p.md': note('提案', 'proposed', '## Proposal\n\n见 [外部](../../../../docs/x.md) 与 [断链](./missing.md)\n'),
    });
    const { notes, scanMs } = await scanNotes(root);
    expect(notes.map((n) => n.slug)).toEqual(['2026-03-01-p', '2026-02-01-child', '2026-01-01-base']);
    expect(notes[1]!.links).toEqual([
      { kind: 'resolved', targetId: 'implemented/architecture/2026-01-01-base.md', rawHref: '../architecture/2026-01-01-base.md', anchor: '' },
    ]);
    expect(notes[0]!.links.map((l) => l.kind)).toEqual(['external', 'unresolved']);
    expect(scanMs).toBeGreaterThanOrEqual(0);
  });

  test('单篇读取失败只告警并跳过，其余照常返回', async () => {
    const root = setup({
      'implemented/feature/2026-01-01-ok.md': note('ok'),
      'implemented/feature/2026-01-02-bad.md': note('bad'),
    });
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const { notes } = await scanNotes(root, async (abs) => {
      if (abs.endsWith('2026-01-02-bad.md')) throw new Error('EACCES');
      return readFileSync(abs, 'utf8');
    });
    expect(notes.map((n) => n.slug)).toEqual(['2026-01-01-ok']);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test('slug 冲突时按 id 码点序先到者胜出', async () => {
    const root = setup({
      'implemented/feature/2026-01-01-dup.md': note('impl'),
      'proposed/feature/2026-01-01-dup.md': note('prop'),
      'rejected/feature/2026-01-02-ref.md': note('ref', 'rejected — x', '## Decision\n\n见 [dup](../../archived/x/2026-01-01-dup.md)\n'),
    });
    const { notes } = await scanNotes(root);
    const ref = notes.find((n) => n.slug === '2026-01-02-ref')!;
    expect(ref.links).toEqual([
      { kind: 'resolved', targetId: 'implemented/feature/2026-01-01-dup.md', rawHref: '../../archived/x/2026-01-01-dup.md', anchor: '' },
    ]);
  });
});
