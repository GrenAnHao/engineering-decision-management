import {
  LIFECYCLES,
  type LifecycleCounts,
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
