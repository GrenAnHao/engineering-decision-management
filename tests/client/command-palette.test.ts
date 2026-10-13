import { describe, expect, test } from 'bun:test';
import { Search } from 'lucide-react';
import type { NoteSummary } from '../../src/shared/types';
import { buildEntries, groupEntries, type PaletteCommand } from '../../src/client/components/CommandPalette';

function note(slug: string, over: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: `implemented/feature/${slug}.md`,
    slug,
    lifecycle: 'implemented',
    cls: 'feature',
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

const command = (id: string, label: string, group = '操作', keywords?: string): PaletteCommand => ({
  id,
  group,
  label,
  keywords,
  icon: Search,
  run: () => {},
});

const COMMANDS = [
  command('view:baseline', '架构基线', '跳转到视图', 'baseline'),
  command('theme', '切换主题', '操作', 'theme dark light 深色'),
  command('add', '添加项目路径'),
];

describe('buildEntries', () => {
  test('没有关键字：最近的决策（按日期倒序，最多 5 条，不含无日期）在前，全部命令在后', () => {
    const notes = [
      note('2026-01-01-a'),
      note('2026-03-01-c'),
      note('2026-02-01-b'),
      note('2026-04-01-d'),
      note('2026-05-01-e'),
      note('2026-06-01-f'),
      note('undated', { date: '' }),
    ];
    const entries = buildEntries('  ', notes, COMMANDS);
    const recent = entries.filter((e) => e.group === '最近的决策');
    expect(recent.map((e) => (e.kind === 'note' ? e.note.slug : ''))).toEqual([
      '2026-06-01-f',
      '2026-05-01-e',
      '2026-04-01-d',
      '2026-03-01-c',
      '2026-02-01-b',
    ]);
    expect(entries.slice(recent.length).map((e) => e.kind)).toEqual(['command', 'command', 'command']);
  });

  test('不会改动传入的笔记数组顺序', () => {
    const notes = [note('2026-01-01-a'), note('2026-02-01-b')];
    buildEntries('', notes, []);
    expect(notes.map((n) => n.slug)).toEqual(['2026-01-01-a', '2026-02-01-b']);
  });

  test('有关键字：先是匹配的决策，再是「查看全部」，最后是匹配的命令', () => {
    const notes = [note('2026-01-01-redis-cache'), note('2026-01-02-other')];
    const entries = buildEntries('redis', notes, COMMANDS);
    expect(entries.map((e) => e.kind)).toEqual(['note', 'all']);
    const all = entries[1]!;
    expect(all.kind === 'all' && all.total).toBe(1);
  });

  test('命令按名称与别名匹配，不区分大小写', () => {
    expect(buildEntries('DARK', [], COMMANDS).map((e) => e.key)).toEqual(['cmd:theme']);
    expect(buildEntries('基线', [], COMMANDS).map((e) => e.key)).toEqual(['cmd:view:baseline']);
    expect(buildEntries('添加', [], COMMANDS).map((e) => e.key)).toEqual(['cmd:add']);
  });

  test('决策只显示前 8 条，但「查看全部」带的是总匹配数', () => {
    const notes = Array.from({ length: 12 }, (_, i) => note(`2026-01-${String(i + 1).padStart(2, '0')}-hit`));
    const entries = buildEntries('hit', notes, []);
    expect(entries.filter((e) => e.kind === 'note')).toHaveLength(8);
    const all = entries.find((e) => e.kind === 'all');
    expect(all?.kind === 'all' && all.total).toBe(12);
  });

  test('什么都没匹配时返回空数组', () => {
    expect(buildEntries('zzz-no-match', [note('2026-01-01-a')], COMMANDS)).toEqual([]);
  });
});

describe('groupEntries', () => {
  test('相邻同组的条目归并成一组，序号沿用整个列表里的位置', () => {
    const entries = buildEntries('', [note('2026-01-01-a')], COMMANDS);
    const groups = groupEntries(entries);
    expect(groups.map((g) => g.group)).toEqual(['最近的决策', '跳转到视图', '操作']);
    expect(groups.flatMap((g) => g.items.map((i) => i.index))).toEqual([0, 1, 2, 3]);
    expect(groups[2]!.items).toHaveLength(2);
  });

  test('空列表没有分组', () => {
    expect(groupEntries([])).toEqual([]);
  });
});
