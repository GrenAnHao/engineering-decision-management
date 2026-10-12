// 前后端共用类型（单一真相）。服务端产出、客户端消费，字段改动两端同时生效。

export const LIFECYCLES = ['implemented', 'proposed', 'rejected', 'archived'] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

export const CLASSES = ['architecture', 'feature', 'bug-fix', 'simplification', 'process', 'testing'] as const;

export function isLifecycle(value: string): value is Lifecycle {
  return (LIFECYCLES as readonly string[]).includes(value);
}

/** 链接三态。rawHref 是笔记原文中的 href（含 #anchor），前端据此把正文里的 <a> 对应回解析结果。 */
export type LinkResult =
  | { kind: 'resolved'; targetId: string; rawHref: string; anchor: string }
  | { kind: 'external'; rawHref: string; anchor: string }
  | { kind: 'unresolved'; rawHref: string; anchor: string };

export type Section = { heading: string; body: string };

export type NoteDoc = {
  id: string;
  slug: string;
  lifecycle: Lifecycle;
  cls: string;
  date: string;
  title: string;
  verdict: string;
  problem: string;
  decision: string;
  alternatives: string;
  consequences: string;
  extraSections: Section[];
  links: LinkResult[];
  /** 原文内容哈希，前端用来判断「正在阅读的笔记是否被改动」 */
  hash: string;
  rawBody: string;
};

export type NoteSummary = Omit<NoteDoc, 'rawBody'>;

export type ProjectSource = 'discovered' | 'manual';
export type WatchMode = 'live' | 'manual';
export type LifecycleCounts = Record<Lifecycle, number>;

export type ProjectMeta = {
  id: string;
  path: string;
  displayName: string;
  source: ProjectSource;
  hidden: boolean;
  healthy: boolean;
  watchMode: WatchMode;
  error: string | null;
  /** 发现顺序，前端用它从色板取色，保证颜色不随排序变化 */
  order: number;
  count: number;
  counts: LifecycleCounts;
  /** 左栏排序依据：最近真实文件事件时间，从未有事件时回落到笔记日期最大值 */
  lastChangeAt: number;
  scannedAt: number;
  scanMs: number;
};

export type ConfigResponse = {
  port: number;
  scanRoots: string[];
  scanDepth: number;
  configError: string | null;
  projects: ProjectMeta[];
};

export type NotesResponse = {
  project: ProjectMeta;
  notes: NoteSummary[];
  inCount: Record<string, number>;
};

export type NoteDetailResponse = { note: NoteDoc };

export type ConnectedEvent = { clientId: string };
export type ProjectUpdatedEvent = {
  id: string;
  count: number;
  delta: number;
  scanMs: number;
  at: number;
  project: ProjectMeta;
};
export type ConfigChangedEvent = { projects: ProjectMeta[] };
export type ProjectErrorEvent = { id: string; reason: string };

export type HubEventMap = {
  connected: ConnectedEvent;
  'project-updated': ProjectUpdatedEvent;
  'config-changed': ConfigChangedEvent;
  'project-error': ProjectErrorEvent;
};
export type HubEventName = keyof HubEventMap;
