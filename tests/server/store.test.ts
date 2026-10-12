import { describe, expect, test } from 'bun:test';
import type { LinkResult, NoteDoc } from '../../src/shared/types';
import {
  applyScan,
  computeInCount,
  countLifecycles,
  createIndex,
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
