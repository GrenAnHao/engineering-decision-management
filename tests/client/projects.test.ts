import { describe, expect, test } from 'bun:test';
import type { ProjectMeta } from '../../src/shared/types';
import { mergeFetchedProjects, projectsAfterRefresh } from '../../src/client/state/projects';

function meta(id: string, over: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    id,
    path: `/${id}`,
    displayName: id,
    source: 'discovered',
    hidden: false,
    healthy: true,
    watchMode: 'live',
    error: null,
    order: 0,
    count: 1,
    counts: { implemented: 1, proposed: 0, rejected: 0, archived: 0 },
    lastChangeAt: 0,
    scannedAt: 0,
    scanMs: 1,
    ...over,
  };
}
const ids = (list: readonly ProjectMeta[] | null) => list?.map((p) => p.id) ?? null;

describe('mergeFetchedProjects', () => {
  test('请求发出后收到过 project-updated 的项目保留内存里更新的 meta，其余以响应为准', () => {
    const fetched = [meta('A', { count: 1 }), meta('B', { count: 1 })];
    const current = [meta('A', { count: 5 }), meta('B', { count: 7 })];
    const merged = mergeFetchedProjects(fetched, current, (id) => id === 'A');
    expect(merged.map((p) => [p.id, p.count])).toEqual([
      ['A', 5],
      ['B', 1],
    ]);
  });

  test('请求发出后才出现的新项目（响应里没有、isNewer）追加在响应项目之后，不会短暂消失', () => {
    const merged = mergeFetchedProjects([meta('A'), meta('B')], [meta('N'), meta('A'), meta('B')], (id) => id === 'N');
    expect(ids(merged)).toEqual(['A', 'B', 'N']);
  });

  test('响应里没有、请求期间也没更新过的项目按响应移除；响应里的新项目照收', () => {
    const merged = mergeFetchedProjects([meta('A'), meta('C')], [meta('A'), meta('B')], () => false);
    expect(ids(merged)).toEqual(['A', 'C']);
  });
});

describe('projectsAfterRefresh', () => {
  test('请求期间来过 config-changed：返回 null，清单保持内存版本不动', () => {
    expect(projectsAfterRefresh([meta('A')], [meta('B')], { configChanged: true, isNewer: () => false })).toBeNull();
  });

  test('没有 config-changed：按 mergeFetchedProjects 合并', () => {
    const next = projectsAfterRefresh([meta('A', { count: 1 })], [meta('A', { count: 9 })], { configChanged: false, isNewer: () => true });
    expect(next?.map((p) => p.count)).toEqual([9]);
  });
});
