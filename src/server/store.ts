import {
  LIFECYCLES,
  type LifecycleCounts,
  type NoteChange,
  type NoteDoc,
  type NoteSummary,
  type ProjectMeta,
  type ProjectSource,
  type WatchMode,
} from '../shared/types';

export type ProjectIndex = {
  id: string;
  /** 归一化路径键（Windows 下小写），用于和配置/发现结果对账 */
  key: string;
  path: string;
  displayName: string;
  source: ProjectSource;
  hidden: boolean;
  order: number;
  healthy: boolean;
  watchMode: WatchMode;
  error: string | null;
  notes: NoteDoc[];
  byId: Map<string, NoteDoc>;
  inCount: Map<string, number>;
  scannedAt: number;
  fileEventAt: number;
  scanMs: number;
};

export type ScanCause = 'initial' | 'file' | 'manual';

export type ProjectInit = Pick<ProjectIndex, 'id' | 'key' | 'path' | 'displayName' | 'source' | 'hidden' | 'order'>;

export function createIndex(init: ProjectInit): ProjectIndex {
  return {
    ...init,
    healthy: true,
    watchMode: 'live',
    error: null,
    notes: [],
    byId: new Map(),
    inCount: new Map(),
    scannedAt: 0,
    fileEventAt: 0,
    scanMs: 0,
  };
}

/** 被引用次数：每篇笔记对同一目标只计一次，只统计 resolved 链接 */
export function computeInCount(notes: readonly NoteDoc[]): Map<string, number> {
  const inCount = new Map<string, number>();
  for (const note of notes) {
    const targets = new Set<string>();
    for (const link of note.links) {
      if (link.kind === 'resolved' && link.targetId !== note.id) targets.add(link.targetId);
    }
    for (const target of targets) inCount.set(target, (inCount.get(target) ?? 0) + 1);
  }
  return inCount;
}

export function countLifecycles(notes: readonly NoteDoc[]): LifecycleCounts {
  const counts = Object.fromEntries(LIFECYCLES.map((l) => [l, 0])) as LifecycleCounts;
  for (const note of notes) counts[note.lifecycle] += 1;
  return counts;
}

/** 两次扫描的笔记集合是否完全相同（id 与内容哈希都一致） */
export function sameNotes(a: readonly NoteDoc[], b: readonly NoteDoc[]): boolean {
  if (a.length !== b.length) return false;
  const hashes = new Map(a.map((n) => [n.id, n.hash]));
  return b.every((n) => hashes.get(n.id) === n.hash);
}

/** 笔记 date 字段的最大值（毫秒），无日期时为 0 */
export function latestNoteDateMs(notes: readonly NoteDoc[]): number {
  let max = 0;
  for (const note of notes) {
    if (!note.date) continue;
    const ms = Date.parse(`${note.date}T00:00:00`);
    if (Number.isFinite(ms) && ms > max) max = ms;
  }
  return max;
}

/** 用一次扫描结果生成新索引（不修改入参） */
export function applyScan(
  index: ProjectIndex,
  notes: NoteDoc[],
  scanMs: number,
  cause: ScanCause,
  now: number,
): ProjectIndex {
  return {
    ...index,
    healthy: true,
    error: null,
    notes,
    byId: new Map(notes.map((n) => [n.id, n])),
    inCount: computeInCount(notes),
    scannedAt: now,
    fileEventAt: cause === 'file' ? now : index.fileEventAt,
    scanMs,
  };
}

export function markUnhealthy(index: ProjectIndex, reason: string): ProjectIndex {
  return { ...index, healthy: false, error: reason, notes: [], byId: new Map(), inCount: new Map() };
}

export function toMeta(index: ProjectIndex): ProjectMeta {
  return {
    id: index.id,
    path: index.path,
    displayName: index.displayName,
    source: index.source,
    hidden: index.hidden,
    healthy: index.healthy,
    watchMode: index.watchMode,
    error: index.error,
    order: index.order,
    count: index.notes.length,
    counts: countLifecycles(index.notes),
    lastChangeAt: index.fileEventAt || latestNoteDateMs(index.notes),
    scannedAt: index.scannedAt,
    scanMs: index.scanMs,
  };
}

export function toSummary(note: NoteDoc): NoteSummary {
  const { rawBody: _rawBody, ...summary } = note;
  return summary;
}

/** 码点序比较，结果与运行时 / 区域设置无关 */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 去掉首段生命周期目录：implemented/feature/x.md → feature/x.md，用来识别状态迁移 */
function withoutLifecycle(id: string): string {
  return id.slice(id.indexOf('/') + 1);
}

const CHANGE_ORDER: Record<NoteChange['kind'], number> = { moved: 0, added: 1, modified: 2, removed: 3 };

/**
 * 两次扫描之间的笔记变化。「迁移」以 lifecycle 字段为准（界面上的状态徽标与计数都用它，Status 行优先、缺失时按目录）：
 * - 同一 id：lifecycle 变了记 moved（id 与 fromId 相同），即使内容也改了也只记这一条；lifecycle 没变而 hash 变了记 modified。
 * - 新增与删除里去掉首段后 id 相同的跨目录配对（同一去首段 id 有多个候选时按完整 id 码点序依次配对）：
 *   lifecycle 不同记 moved（id 取新、fromId 取旧）；lifecycle 相同（只换了目录、Status 没变）记 modified（id、lifecycle 取新值）。
 * - 其余新增记 added，其余删除记 removed。
 * 输出按 迁移 → 新增 → 修改 → 删除，组内按标题、再按 id 排序。
 */
export function diffNotes(prev: readonly NoteDoc[], next: readonly NoteDoc[]): NoteChange[] {
  const prevById = new Map(prev.map((n) => [n.id, n]));
  const nextById = new Map(next.map((n) => [n.id, n]));
  const byId = (a: NoteDoc, b: NoteDoc) => byCodePoint(a.id, b.id);
  const added = next.filter((n) => !prevById.has(n.id)).sort(byId);
  const removed = prev.filter((n) => !nextById.has(n.id)).sort(byId);

  const removedByRest = new Map<string, NoteDoc[]>();
  for (const n of removed) {
    const rest = withoutLifecycle(n.id);
    removedByRest.set(rest, [...(removedByRest.get(rest) ?? []), n]);
  }

  const changes: NoteChange[] = [];
  const paired = new Set<string>();
  for (const n of added) {
    const from = removedByRest.get(withoutLifecycle(n.id))?.find((c) => !paired.has(c.id));
    if (from) {
      paired.add(from.id);
      changes.push(
        from.lifecycle !== n.lifecycle
          ? { kind: 'moved', id: n.id, fromId: from.id, title: n.title, from: from.lifecycle, to: n.lifecycle }
          : { kind: 'modified', id: n.id, title: n.title, lifecycle: n.lifecycle },
      );
    } else {
      changes.push({ kind: 'added', id: n.id, title: n.title, lifecycle: n.lifecycle });
    }
  }
  for (const n of next) {
    const old = prevById.get(n.id);
    if (!old) continue;
    if (old.lifecycle !== n.lifecycle) {
      changes.push({ kind: 'moved', id: n.id, fromId: n.id, title: n.title, from: old.lifecycle, to: n.lifecycle });
    } else if (old.hash !== n.hash) {
      changes.push({ kind: 'modified', id: n.id, title: n.title, lifecycle: n.lifecycle });
    }
  }
  for (const n of removed) {
    if (!paired.has(n.id)) changes.push({ kind: 'removed', id: n.id, title: n.title, lifecycle: n.lifecycle });
  }

  return changes.sort(
    (a, b) => CHANGE_ORDER[a.kind] - CHANGE_ORDER[b.kind] || byCodePoint(a.title, b.title) || byCodePoint(a.id, b.id),
  );
}
