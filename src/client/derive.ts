// 视图的纯计算：输入笔记列表与筛选条件，输出要渲染的数据。全部无副作用，便于单测。
import { CLASSES, type Lifecycle, type NoteSummary } from '../shared/types';
import { plainText } from './format';

export type InCount = Readonly<Record<string, number>>;

export function cites(inCount: InCount, id: string): number {
  return inCount[id] ?? 0;
}

// ---------- 架构基线 ----------

export type KpiTarget = { status: Lifecycle } | { cls: string };
export type Kpi = { key: string; label: string; caption: string; color: string; count: number; target: KpiTarget };

export function computeKpis(notes: readonly NoteSummary[]): Kpi[] {
  const byStatus = (s: Lifecycle) => notes.filter((n) => n.lifecycle === s).length;
  return [
    { key: 'implemented', label: '现行落地', caption: '生产已交付生效', color: '#059669', count: byStatus('implemented'), target: { status: 'implemented' } },
    { key: 'proposed', label: '待评审提案', caption: '待团队确认', color: '#D97706', count: byStatus('proposed'), target: { status: 'proposed' } },
    { key: 'rejected', label: '避坑否决', caption: '防重犯事实存档', color: '#DC2626', count: byStatus('rejected'), target: { status: 'rejected' } },
    {
      key: 'simplification',
      label: '化简裁撤',
      caption: '代码只减不增',
      color: '#0D9488',
      count: notes.filter((n) => n.cls === 'simplification').length,
      target: { cls: 'simplification' },
    },
  ];
}

/** 系统承重墙：已落地笔记按被引用次数降序取前 N（同分保持原顺序） */
export function pillars(notes: readonly NoteSummary[], inCount: InCount, limit = 6): NoteSummary[] {
  return notes
    .filter((n) => n.lifecycle === 'implemented')
    .map((n, i) => ({ n, i }))
    .sort((a, b) => cites(inCount, b.n.id) - cites(inCount, a.n.id) || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.n);
}

export function pillarAbstract(note: NoteSummary): string {
  return plainText(note.decision || note.problem) || '系统核心架构协议';
}

/** 所有出现过的分类：固定六类在前，其余按字母序追加 */
export function classesOf(notes: readonly NoteSummary[]): string[] {
  const extra = [...new Set(notes.map((n) => n.cls))].filter((c) => !(CLASSES as readonly string[]).includes(c)).sort();
  return [...CLASSES, ...extra];
}

/** 领域分类阵列：现行生效（已落地 + 待评审）按分类分组 */
export function chambers(notes: readonly NoteSummary[]): { cls: string; notes: NoteSummary[] }[] {
  const active = notes.filter((n) => n.lifecycle === 'implemented' || n.lifecycle === 'proposed');
  return classesOf(notes).map((cls) => ({ cls, notes: active.filter((n) => n.cls === cls) }));
}

// ---------- 演进时间线 ----------

export type TimelineData = {
  total: number;
  months: { month: string; count: number }[];
  classCounts: { cls: string; count: number }[];
  filtered: NoteSummary[];
  groups: { month: string; notes: NoteSummary[] }[];
};

function groupByMonth(notes: readonly NoteSummary[]): Map<string, NoteSummary[]> {
  const groups = new Map<string, NoteSummary[]>();
  for (const n of notes) {
    const month = n.date.slice(0, 7);
    const list = groups.get(month) ?? [];
    list.push(n);
    groups.set(month, list);
  }
  return groups;
}

/** 月份胶囊 × 分类胶囊正交筛选；胶囊上的计数基于全部带日期笔记 */
export function timeline(notes: readonly NoteSummary[], month: string, cls: string): TimelineData {
  const dated = notes.filter((n) => n.date).sort((a, b) => b.date.localeCompare(a.date));
  const filtered = dated.filter((n) => (!month || n.date.startsWith(month)) && (!cls || n.cls === cls));
  return {
    total: dated.length,
    months: [...groupByMonth(dated)].map(([m, list]) => ({ month: m, count: list.length })),
    classCounts: classesOf(notes).map((c) => ({ cls: c, count: dated.filter((n) => n.cls === c).length })),
    filtered,
    groups: [...groupByMonth(filtered)].map(([m, list]) => ({ month: m, notes: list })),
  };
}

// ---------- 避坑智库 ----------

export type Pitfall = {
  key: string;
  noteId: string;
  slug: string;
  cls: string;
  title: string;
  discarded: string;
  crux: string;
  winner: string;
};

function cleanAlternative(part: string): string {
  return part
    .replace(/^[-#* ]+/, '')
    .trim()
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1');
}

/** 否决提案 + 每条「曾考虑的备选」拆成一张避坑卡 */
export function pitfalls(notes: readonly NoteSummary[], query: string): Pitfall[] {
  const items: Pitfall[] = [];
  for (const n of notes) {
    const base = { noteId: n.id, slug: n.slug, cls: n.cls, title: n.title };
    if (n.lifecycle === 'rejected') {
      items.push({
        ...base,
        key: `${n.id}#rejected`,
        discarded: `[已否决提案] ${n.title}`,
        crux: plainText(n.verdict) || plainText(n.problem) || '审慎否决，防止重犯。',
        winner: '提案直接否决',
      });
    }
    if (!n.alternatives) continue;
    n.alternatives.split(/\n(?=###? |- )/).forEach((part, i) => {
      const clean = cleanAlternative(part);
      if (clean.length <= 5) return;
      const colon = clean.indexOf('：') > -1 ? clean.indexOf('：') : clean.indexOf(':');
      const hasHeading = colon > 0 && colon < 35;
      items.push({
        ...base,
        key: `${n.id}#alt-${i}`,
        discarded: hasHeading ? clean.slice(0, colon) : clean.slice(0, 45),
        crux: (hasHeading ? clean.slice(colon + 1) : clean).trim(),
        winner: `采纳决策: ${n.title}`,
      });
    });
  }
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => `${it.discarded} ${it.crux} ${it.title}`.toLowerCase().includes(q));
}

// ---------- 决策清单 / 全局搜索 ----------

export type SortMode = 'new' | 'old' | 'cites';

export function matchesQuery(note: NoteSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${note.title} ${note.slug} ${note.problem} ${note.decision}`.toLowerCase().includes(q);
}

export function directory(
  notes: readonly NoteSummary[],
  inCount: InCount,
  opts: { status: Lifecycle | ''; cls: string; sort: SortMode; query: string },
): NoteSummary[] {
  const list = notes.filter(
    (n) => (!opts.status || n.lifecycle === opts.status) && (!opts.cls || n.cls === opts.cls) && matchesQuery(n, opts.query),
  );
  if (opts.sort === 'new') return list.sort((a, b) => b.date.localeCompare(a.date));
  if (opts.sort === 'old') return list.sort((a, b) => a.date.localeCompare(b.date));
  return list.sort((a, b) => cites(inCount, b.id) - cites(inCount, a.id));
}

export function searchNotes(notes: readonly NoteSummary[], query: string, limit = 7): { total: number; top: NoteSummary[] } {
  if (!query.trim()) return { total: 0, top: [] };
  const matches = notes.filter((n) => matchesQuery(n, query));
  return { total: matches.length, top: matches.slice(0, limit) };
}

// ---------- 抽屉 ----------

/** 按 id 找，找不到再按 slug 找（深链用 slug） */
export function findNote(notes: readonly NoteSummary[], key: string): NoteSummary | undefined {
  return notes.find((n) => n.id === key) ?? notes.find((n) => n.slug === key);
}

/** 入链：哪些笔记引用了它 */
export function incoming(notes: readonly NoteSummary[], id: string): NoteSummary[] {
  return notes.filter((n) => n.id !== id && n.links.some((l) => l.kind === 'resolved' && l.targetId === id));
}
