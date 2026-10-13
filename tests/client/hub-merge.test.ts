import { expect, test } from 'bun:test';
import type { ProjectMeta } from '../../src/shared/types';
import { mergeFetchedProjects } from '../../src/client/state/useHub';

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

test('请求发出后收到过 project-updated 的项目保留内存里更新的 meta，其余以响应为准', () => {
  const fetched = [meta('A', { count: 1 }), meta('B', { count: 1 })];
  const current = [meta('A', { count: 5 }), meta('B', { count: 7 })];
  const merged = mergeFetchedProjects(fetched, current, (id) => id === 'A');
  expect(merged.map((p) => [p.id, p.count])).toEqual([
    ['A', 5],
    ['B', 1],
  ]);
});

test('增删以响应为准：响应里没有的项目被移除，内存里没有的新项目照收', () => {
  const merged = mergeFetchedProjects([meta('A'), meta('C')], [meta('A'), meta('B')], () => true);
  expect(merged.map((p) => p.id)).toEqual(['A', 'C']);
});
