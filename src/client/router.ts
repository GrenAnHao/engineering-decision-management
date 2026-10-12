export const VIEWS = ['baseline', 'timeline', 'alternatives', 'directory'] as const;
export type ViewId = (typeof VIEWS)[number];

export const VIEW_LABELS: Record<ViewId, string> = {
  baseline: '🏛️ 架构基线',
  timeline: '⏱️ 演进时间线',
  alternatives: '🛡️ 避坑智库',
  directory: '📋 决策清单',
};

export type Route = { projectId: string; view: ViewId; note: string | null };
export type ParsedHash = { projectId: string | null; view: string | null; note: string | null };

function isView(value: string | null): value is ViewId {
  return value !== null && (VIEWS as readonly string[]).includes(value);
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 解析 `#<项目>/<视图>[/note=<笔记>]`，兼容旧看板的 `#note=<id>` 与 `#<视图>` */
export function parseHash(hash: string): ParsedHash {
  const body = hash.replace(/^#/, '');
  if (!body) return { projectId: null, view: null, note: null };
  if (body.startsWith('note=')) return { projectId: null, view: null, note: decode(body.slice(5)) };
  const [project = '', view = '', ...rest] = body.split('/');
  const tail = rest.join('/');
  return {
    projectId: project ? decode(project) : null,
    view: view || null,
    note: tail.startsWith('note=') ? decode(tail.slice(5)) || null : null,
  };
}

/**
 * 把解析结果规整为合法路由：未知项目回落到 fallbackIds 的首个，未知视图回落 baseline。
 * knownIds 是全部项目（含隐藏），fallbackIds 是左栏可见项目（已排序）。没有任何项目时返回 null。
 */
export function normalizeRoute(parsed: ParsedHash, knownIds: readonly string[], fallbackIds: readonly string[]): Route | null {
  let { projectId, view } = parsed;
  if (projectId && !knownIds.includes(projectId) && isView(projectId)) {
    view = projectId;
    projectId = null;
  }
  const id = projectId && knownIds.includes(projectId) ? projectId : (fallbackIds[0] ?? knownIds[0]);
  if (!id) return null;
  return { projectId: id, view: isView(view) ? view : 'baseline', note: parsed.note };
}

export function formatHash(route: Route): string {
  const base = `#${encodeURIComponent(route.projectId)}/${route.view}`;
  return route.note ? `${base}/note=${encodeURIComponent(route.note)}` : base;
}
