import { describe, expect, test } from 'bun:test';
import type { LinkResult, NoteDoc } from '../../src/shared/types';
import {
  applyScan,
  computeInCount,
  countLifecycles,
  createIndex,
  diffNotes,
  latestNoteDateMs,
  markUnhealthy,
  sameNotes,
  toMeta,
  toSummary,
} from '../../src/server/store';

function doc(id: string, links: LinkResult[] = [], date = '2026-01-01'): NoteDoc {
  return {
    id,
    slug: id.split('/').pop()!.replace(/\.md$/, ''),
    lifecycle: id.split('/')[0] as NoteDoc['lifecycle'],
    cls: id.split('/')[1]!,
    date,
    title: id,
    verdict: '',
    problem: '',
    decision: '',
    alternatives: '',
    consequences: '',
    extraSections: [],
    links,
    hash: '0',
    rawBody: 'raw',
  };
}

const to = (targetId: string): LinkResult => ({ kind: 'resolved', targetId, rawHref: targetId, anchor: '' });

const INIT = { id: 'P', key: 'p', path: '/p', displayName: 'P', source: 'discovered' as const, hidden: false, order: 0 };

describe('computeInCount', () => {
  test('同一来源对同一目标只计一次，外部与断链不计入', () => {
    const notes = [
      doc('implemented/a/x.md'),
      doc('implemented/a/y.md', [to('implemented/a/x.md'), to('implemented/a/x.md')]),
      doc('implemented/a/z.md', [
        to('implemented/a/x.md'),
        { kind: 'external', rawHref: '../../../d.md', anchor: '' },
        { kind: 'unresolved', rawHref: './m.md', anchor: '' },
      ]),
    ];
    expect(Object.fromEntries(computeInCount(notes))).toEqual({ 'implemented/a/x.md': 2 });
  });
});

describe('countLifecycles / latestNoteDateMs', () => {
  test('按生命周期计数且四个键齐全', () => {
    expect(countLifecycles([doc('implemented/a/x.md'), doc('rejected/a/y.md')])).toEqual({
      implemented: 1,
      proposed: 0,
      rejected: 1,
      archived: 0,
    });
  });

  test('取最大日期，无日期时为 0', () => {
    expect(latestNoteDateMs([doc('implemented/a/x.md', [], '2026-01-01'), doc('implemented/a/y.md', [], '2026-03-01')])).toBe(
      Date.parse('2026-03-01T00:00:00'),
    );
    expect(latestNoteDateMs([doc('implemented/a/x.md', [], '')])).toBe(0);
  });
});

describe('applyScan / toMeta', () => {
  test('只有 file 触发的扫描才更新 fileEventAt', () => {
    const base = createIndex(INIT);
    const initial = applyScan(base, [doc('implemented/a/x.md')], 3, 'initial', 1000);
    expect(initial.fileEventAt).toBe(0);
    const fromFile = applyScan(initial, [], 2, 'file', 2000);
    expect(fromFile.fileEventAt).toBe(2000);
    const manual = applyScan(fromFile, [], 2, 'manual', 3000);
    expect(manual.fileEventAt).toBe(2000);
    expect(manual.scannedAt).toBe(3000);
  });

  test('不修改入参索引', () => {
    const base = createIndex(INIT);
    applyScan(base, [doc('implemented/a/x.md')], 1, 'initial', 1);
    expect(base.notes).toHaveLength(0);
  });

  test('lastChangeAt 在无文件事件时回落到笔记最大日期', () => {
    const idx = applyScan(createIndex(INIT), [doc('implemented/a/x.md', [], '2026-02-02')], 1, 'initial', 99);
    expect(toMeta(idx).lastChangeAt).toBe(Date.parse('2026-02-02T00:00:00'));
    expect(toMeta(applyScan(idx, idx.notes, 1, 'file', 5e12)).lastChangeAt).toBe(5e12);
  });

  test('markUnhealthy 清空笔记并记录原因', () => {
    const idx = markUnhealthy(applyScan(createIndex(INIT), [doc('implemented/a/x.md')], 1, 'initial', 1), '路径失效');
    expect(toMeta(idx)).toMatchObject({ healthy: false, error: '路径失效', count: 0 });
  });
});

test('toSummary 去掉 rawBody', () => {
  expect('rawBody' in toSummary(doc('implemented/a/x.md'))).toBe(false);
});

describe('sameNotes', () => {
  test('id 与 hash 都一致才算相同；改 hash、增删笔记都不同', () => {
    const a = [doc('implemented/a/x.md'), doc('implemented/a/y.md')];
    expect(sameNotes(a, [doc('implemented/a/y.md'), doc('implemented/a/x.md')])).toBe(true);
    expect(sameNotes(a, [doc('implemented/a/x.md'), { ...doc('implemented/a/y.md'), hash: '1' }])).toBe(false);
    expect(sameNotes(a, [doc('implemented/a/x.md')])).toBe(false);
    expect(sameNotes(a, [doc('implemented/a/x.md'), doc('implemented/a/z.md')])).toBe(false);
  });
});

describe('diffNotes', () => {
  const withHash = (id: string, hash: string, title = id): NoteDoc => ({ ...doc(id), hash, title });

  test('无变化时返回空数组', () => {
    const notes = [doc('implemented/a/x.md'), doc('proposed/a/y.md')];
    expect(diffNotes(notes, notes)).toEqual([]);
  });

  test('识别新增、修改、删除', () => {
    const prev = [withHash('implemented/a/keep.md', '1'), withHash('implemented/a/edit.md', '1'), withHash('implemented/a/gone.md', '1')];
    const next = [withHash('implemented/a/keep.md', '1'), withHash('implemented/a/edit.md', '2'), withHash('proposed/b/new.md', '1')];
    expect(diffNotes(prev, next)).toEqual([
      { kind: 'added', id: 'proposed/b/new.md', title: 'proposed/b/new.md', lifecycle: 'proposed' },
      { kind: 'modified', id: 'implemented/a/edit.md', title: 'implemented/a/edit.md', lifecycle: 'implemented' },
      { kind: 'removed', id: 'implemented/a/gone.md', title: 'implemented/a/gone.md', lifecycle: 'implemented' },
    ]);
  });

  test('换了生命周期目录的同名笔记记为一次迁移，内容同时改了也只记一条', () => {
    const prev = [withHash('proposed/feature/2026-01-01-x.md', '1', 'X')];
    const next = [withHash('implemented/feature/2026-01-01-x.md', '2', 'X 改')];
    expect(diffNotes(prev, next)).toEqual([
      {
        kind: 'moved',
        id: 'implemented/feature/2026-01-01-x.md',
        fromId: 'proposed/feature/2026-01-01-x.md',
        title: 'X 改',
        from: 'proposed',
        to: 'implemented',
      },
    ]);
  });

  test('同一去首段 id 有多个候选时按完整 id 码点序配对，多出来的仍记为删除', () => {
    const prev = [doc('rejected/a/x.md'), doc('proposed/a/x.md')];
    const next = [doc('implemented/a/x.md')];
    expect(diffNotes(prev, next)).toEqual([
      { kind: 'moved', id: 'implemented/a/x.md', fromId: 'proposed/a/x.md', title: 'implemented/a/x.md', from: 'proposed', to: 'implemented' },
      { kind: 'removed', id: 'rejected/a/x.md', title: 'rejected/a/x.md', lifecycle: 'rejected' },
    ]);
  });

  test('不同分类目录下的同名文件不算迁移', () => {
    const changes = diffNotes([doc('proposed/a/x.md')], [doc('implemented/b/x.md')]);
    expect(changes.map((c) => c.kind)).toEqual(['added', 'removed']);
  });

  test('输出按 迁移 → 新增 → 修改 → 删除 排序，组内按标题', () => {
    const prev = [withHash('implemented/a/m.md', '1', 'M'), doc('proposed/a/mv.md'), withHash('implemented/a/z.md', '1', 'Z'), withHash('implemented/a/b.md', '1', 'B')];
    const next = [
      withHash('implemented/a/m.md', '2', 'M'),
      doc('implemented/a/mv.md'),
      withHash('proposed/a/y.md', '1', 'Y'),
      withHash('proposed/a/c.md', '1', 'C'),
    ];
    expect(diffNotes(prev, next).map((c) => `${c.kind}:${c.title}`)).toEqual([
      'moved:implemented/a/mv.md',
      'added:C',
      'added:Y',
      'modified:M',
      'removed:B',
      'removed:Z',
    ]);
  });
});
