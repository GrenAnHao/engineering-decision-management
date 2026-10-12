import { describe, expect, test } from 'bun:test';
import type { LinkResult, NoteSummary } from '../../src/shared/types';
import {
  chambers,
  computeKpis,
  directory,
  findNote,
  incoming,
  pillars,
  pitfalls,
  searchNotes,
  timeline,
} from '../../src/client/derive';
import { filtersReducer, INITIAL_FILTERS } from '../../src/client/state/filters';

function n(id: string, over: Partial<NoteSummary> = {}): NoteSummary {
  const [lifecycle, cls, file] = id.split('/') as [NoteSummary['lifecycle'], string, string];
  const slug = file.replace(/\.md$/, '');
  return {
    id,
    slug,
    lifecycle,
    cls,
    date: /^\d{4}-\d{2}-\d{2}/.exec(slug)?.[0] ?? '',
    title: slug,
    verdict: '',
    problem: '',
    decision: '',
    alternatives: '',
    consequences: '',
    extraSections: [],
    links: [],
    hash: '0',
    ...over,
  };
}

const link = (targetId: string): LinkResult => ({ kind: 'resolved', targetId, rawHref: targetId, anchor: '' });

const NOTES = [
  n('implemented/architecture/2026-10-01-a.md', { decision: '**决定** A' }),
  n('implemented/feature/2026-09-15-b.md', { links: [link('implemented/architecture/2026-10-01-a.md')] }),
  n('proposed/feature/2026-09-01-c.md'),
  n('rejected/architecture/2026-08-20-d.md', { verdict: '被 [新](../x.md) 取代', problem: '老问题' }),
  n('implemented/simplification/2026-08-01-e.md', {
    alternatives: `- **保留旧实现**：维护成本高\n- ${'无冒号的长备选'.repeat(8)}\n- 短`,
  }),
  n('archived/process/no-date.md'),
];
const IN_COUNT = { 'implemented/architecture/2026-10-01-a.md': 1 };

describe('基线', () => {
  test('KPI 计数与跳转目标', () => {
    expect(computeKpis(NOTES).map((k) => [k.key, k.count])).toEqual([
      ['implemented', 3],
      ['proposed', 1],
      ['rejected', 1],
      ['simplification', 1],
    ]);
    expect(computeKpis(NOTES)[3]!.target).toEqual({ cls: 'simplification' });
  });

  test('承重墙只取已落地，按被引用降序', () => {
    expect(pillars(NOTES, IN_COUNT).map((x) => x.slug)).toEqual(['2026-10-01-a', '2026-09-15-b', '2026-08-01-e']);
    expect(pillars(NOTES, IN_COUNT, 1)).toHaveLength(1);
  });

  test('分类阵列只收已落地与待评审，固定六列', () => {
    const result = chambers(NOTES);
    expect(result.map((c) => c.cls)).toEqual(['architecture', 'feature', 'bug-fix', 'simplification', 'process', 'testing']);
    expect(result.find((c) => c.cls === 'feature')!.notes).toHaveLength(2);
    expect(result.find((c) => c.cls === 'architecture')!.notes.map((x) => x.slug)).toEqual(['2026-10-01-a']);
  });
});

describe('时间线', () => {
  test('月份 × 分类正交筛选，无日期笔记不出现', () => {
    const all = timeline(NOTES, '', '');
    expect(all.total).toBe(5);
    expect(all.months).toEqual([
      { month: '2026-10', count: 1 },
      { month: '2026-09', count: 2 },
      { month: '2026-08', count: 2 },
    ]);
    const sliced = timeline(NOTES, '2026-09', 'feature');
    expect(sliced.filtered.map((x) => x.slug)).toEqual(['2026-09-15-b', '2026-09-01-c']);
    expect(sliced.groups).toHaveLength(1);
    expect(sliced.classCounts.find((c) => c.cls === 'feature')!.count).toBe(2);
  });
});

describe('避坑智库', () => {
  test('否决提案用 verdict 作为权衡依据；备选按冒号拆标题', () => {
    const items = pitfalls(NOTES, '');
    expect(items[0]).toMatchObject({ discarded: '[已否决提案] 2026-08-20-d', crux: '被 新 取代', winner: '提案直接否决' });
    expect(items[1]).toMatchObject({ discarded: '保留旧实现', crux: '维护成本高' });
    expect(items[2]!.discarded).toHaveLength(45);
    expect(items).toHaveLength(3);
  });

  test('关键字过滤', () => {
    expect(pitfalls(NOTES, '维护').map((p) => p.discarded)).toEqual(['保留旧实现']);
  });
});

describe('决策清单与搜索', () => {
  test('状态 / 分类 / 关键字 / 排序', () => {
    const base = { status: '' as const, cls: '', sort: 'new' as const, query: '' };
    expect(directory(NOTES, IN_COUNT, { ...base, status: 'implemented' })).toHaveLength(3);
    expect(directory(NOTES, IN_COUNT, { ...base, cls: 'feature' })).toHaveLength(2);
    expect(directory(NOTES, IN_COUNT, { ...base, query: '决定' }).map((x) => x.slug)).toEqual(['2026-10-01-a']);
    expect(directory(NOTES, IN_COUNT, { ...base, sort: 'old' })[0]!.slug).toBe('no-date');
    expect(directory(NOTES, IN_COUNT, { ...base, sort: 'cites' })[0]!.slug).toBe('2026-10-01-a');
  });

  test('全局搜索返回总数与前 N 条', () => {
    expect(searchNotes(NOTES, '2026', 2)).toMatchObject({ total: 5 });
    expect(searchNotes(NOTES, '2026', 2).top).toHaveLength(2);
    expect(searchNotes(NOTES, '  ').total).toBe(0);
  });
});

describe('抽屉辅助', () => {
  test('findNote 先按 id 再按 slug', () => {
    expect(findNote(NOTES, '2026-09-01-c')?.id).toBe('proposed/feature/2026-09-01-c.md');
    expect(findNote(NOTES, 'implemented/feature/2026-09-15-b.md')?.slug).toBe('2026-09-15-b');
    expect(findNote(NOTES, 'missing')).toBeUndefined();
  });

  test('incoming 找出引用者', () => {
    expect(incoming(NOTES, 'implemented/architecture/2026-10-01-a.md').map((x) => x.slug)).toEqual(['2026-09-15-b']);
  });
});

describe('filtersReducer', () => {
  test('KPI 跳转设置状态或分类并清掉另一项', () => {
    const s1 = filtersReducer({ ...INITIAL_FILTERS, cls: 'feature' }, { type: 'jump', target: { status: 'rejected' } });
    expect(s1).toMatchObject({ status: 'rejected', cls: '' });
    const s2 = filtersReducer(s1, { type: 'jump', target: { cls: 'simplification' } });
    expect(s2).toMatchObject({ status: '', cls: 'simplification' });
  });

  test('重置时间线 / 清单筛选只影响各自字段', () => {
    const s = { ...INITIAL_FILTERS, timelineMonth: '2026-09', status: 'proposed' as const, altQuery: 'x' };
    expect(filtersReducer(s, { type: 'reset-timeline' })).toMatchObject({ timelineMonth: '', status: 'proposed', altQuery: 'x' });
    expect(filtersReducer(s, { type: 'reset-directory' })).toMatchObject({ timelineMonth: '2026-09', status: '' });
  });
});
