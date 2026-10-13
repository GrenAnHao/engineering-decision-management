import type { ProjectMeta } from '../../shared/types';

/**
 * 合并一次 /api/config 的响应。isNewer(id) 为真表示请求发出之后又收到过该项目的 project-updated，
 * 内存里的 meta 比响应新：
 * - 响应里有的项目按响应顺序在前，isNewer 的用内存版本；
 * - 内存里有、响应里没有、且 isNewer 的项目（请求发出后才出现的新项目）追加在后面，不让它短暂消失；
 * - 其余以响应为准，包括删除。
 * 顺序无关紧要：左栏和项目切换都会按自己的规则排序。
 */
export function mergeFetchedProjects(
  fetched: readonly ProjectMeta[],
  current: readonly ProjectMeta[],
  isNewer: (id: string) => boolean,
): ProjectMeta[] {
  const fetchedIds = new Set(fetched.map((p) => p.id));
  const merged = fetched.map((p) => (isNewer(p.id) ? (current.find((q) => q.id === p.id) ?? p) : p));
  const appeared = current.filter((q) => !fetchedIds.has(q.id) && isNewer(q.id));
  return [...merged, ...appeared];
}

export type RefreshGuard = {
  /** 请求发出之后来过 config-changed：事件带的是更新的完整清单，响应里的清单已经过时 */
  configChanged: boolean;
  isNewer: (id: string) => boolean;
};

/** refresh 响应回来后的项目清单；返回 null 表示保持内存里的清单不动（只更新 configError 等） */
export function projectsAfterRefresh(fetched: readonly ProjectMeta[], current: readonly ProjectMeta[], guard: RefreshGuard): ProjectMeta[] | null {
  if (guard.configChanged) return null;
  return mergeFetchedProjects(fetched, current, guard.isNewer);
}
