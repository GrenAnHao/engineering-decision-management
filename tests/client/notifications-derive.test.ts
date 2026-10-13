import { describe, expect, test } from 'bun:test';
import type { NoteChange, ProjectMeta } from '../../src/shared/types';
import {
  changeLabel,
  groupByDay,
  notificationText,
  remainderText,
  summarize,
  toNotifications,
} from '../../src/client/notifications/derive';
import type { AppNotification } from '../../src/client/notifications/types';

function meta(over: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    id: 'P',
    path: '/p',
    displayName: '项目 P',
    source: 'discovered',
    hidden: false,
    healthy: true,
    watchMode: 'live',
    error: null,
    order: 2,
    count: 1,
    counts: { implemented: 1, proposed: 0, rejected: 0, archived: 0 },
    lastChangeAt: 0,
    scannedAt: 0,
    scanMs: 1,
    ...over,
  };
}

const added: NoteChange = { kind: 'added', id: 'implemented/a/x.md', title: 'X', lifecycle: 'implemented' };
const modified: NoteChange = { kind: 'modified', id: 'implemented/a/y.md', title: 'Y', lifecycle: 'implemented' };
const removed: NoteChange = { kind: 'removed', id: 'implemented/a/z.md', title: 'Z', lifecycle: 'implemented' };
const moved: NoteChange = { kind: 'moved', id: 'implemented/a/m.md', fromId: 'proposed/a/m.md', title: 'M', from: 'proposed', to: 'implemented' };

const updated = (project: ProjectMeta, changes?: NoteChange[], at = 1000) => ({
  name: 'project-updated' as const,
  data: { id: project.id, count: project.count, delta: 0, scanMs: 1, at, project, ...(changes ? { changes } : {}) },
});
const errored = (reason: string, at = 2000) => ({ name: 'project-error' as const, data: { id: 'P', reason, at } });
const NO_ERRORS: ReadonlyMap<string, string> = new Map();

describe('toNotifications', () => {
  test('带 changes 的更新生成一条变更通知，项目名与色序取快照', () => {
    const { notifications } = toNotifications(updated(meta(), [added]), meta(), NO_ERRORS);
    expect(notifications).toEqual([
      {
        id: 'changes:P:1000',
        projectId: 'P',
        projectName: '项目 P',
        projectOrder: 2,
        at: 1000,
        read: false,
        body: { type: 'changes', changes: [added] },
      },
    ]);
  });

  test('没有 changes 的更新不通知', () => {
    expect(toNotifications(updated(meta()), meta(), NO_ERRORS).notifications).toEqual([]);
    expect(toNotifications(updated(meta(), []), meta(), NO_ERRORS).notifications).toEqual([]);
  });

  test('隐藏项目一律不通知', () => {
    const hidden = meta({ hidden: true });
    expect(toNotifications(updated(hidden, [added]), hidden, NO_ERRORS).notifications).toEqual([]);
    expect(toNotifications(errored('坏了'), hidden, NO_ERRORS).notifications).toEqual([]);
  });

  test('从失效或手动刷新回到健康 + 实时监听时发一条已恢复，并清掉该项目的异常记录', () => {
    const errors = new Map([['P', '坏了']]);
    const fromBroken = toNotifications(updated(meta()), meta({ healthy: false, watchMode: 'manual' }), errors);
    expect(fromBroken.notifications.map((n) => n.body)).toEqual([{ type: 'recovered' }]);
    expect(fromBroken.notifications[0]!.id).toBe('recovered:P:1000');
    expect(fromBroken.lastErrors.has('P')).toBe(false);

    const fromManual = toNotifications(updated(meta()), meta({ watchMode: 'manual' }), NO_ERRORS);
    expect(fromManual.notifications.map((n) => n.body.type)).toEqual(['recovered']);
  });

  test('隐藏项目恢复时不通知，但仍清掉异常记录', () => {
    const hidden = meta({ hidden: true });
    const result = toNotifications(updated(hidden, [added]), meta({ hidden: true, watchMode: 'manual' }), new Map([['P', '坏了']]));
    expect(result.notifications).toEqual([]);
    expect(result.lastErrors.has('P')).toBe(false);
  });

  test('恢复与变更同时发生时两条都发，已恢复在前', () => {
    const { notifications } = toNotifications(updated(meta(), [added]), meta({ watchMode: 'manual' }), NO_ERRORS);
    expect(notifications.map((n) => n.body.type)).toEqual(['recovered', 'changes']);
  });

  test('仍不健康的更新不算恢复', () => {
    const still = meta({ healthy: false, watchMode: 'manual' });
    expect(toNotifications(updated(still), still, NO_ERRORS).notifications).toEqual([]);
  });

  test('异常：恢复前同一原因只通知一次，换了原因再通知', () => {
    const first = toNotifications(errored('坏了'), meta(), NO_ERRORS);
    expect(first.notifications.map((n) => [n.id, n.body])).toEqual([['error:P:2000', { type: 'error', reason: '坏了' }]]);
    expect(toNotifications(errored('坏了', 3000), meta(), first.lastErrors).notifications).toEqual([]);
    expect(toNotifications(errored('又坏了', 3000), meta(), first.lastErrors).notifications).toHaveLength(1);
  });

  test('前端还不认识的项目报异常时不通知', () => {
    expect(toNotifications(errored('坏了'), undefined, NO_ERRORS).notifications).toEqual([]);
  });

  test('不修改传入的 lastErrors', () => {
    const errors = new Map([['P', '坏了']]);
    toNotifications(updated(meta()), meta({ watchMode: 'manual' }), errors);
    toNotifications(errored('又坏了'), meta(), errors);
    expect([...errors]).toEqual([['P', '坏了']]);
  });
});

describe('文案', () => {
  test('迁移标签用状态中文名，其余用动作名', () => {
    expect(changeLabel(moved)).toBe('待评审 → 已落地');
    expect(changeLabel(added)).toBe('新增');
    expect(changeLabel(removed)).toBe('删除');
  });

  test('summarize 按 迁移 / 新增 / 修改 / 删除 列出非零项', () => {
    expect(summarize([modified, added, modified, moved])).toBe('迁移 1、新增 1、修改 2');
  });

  test('remainderText 汇总前 limit 处之后的部分；没有剩余返回 null', () => {
    expect(remainderText([moved, added, added, modified, removed], 3)).toBe('另有 1 处修改、1 处删除');
    expect(remainderText([added, modified], 3)).toBeNull();
  });

  test('notificationText 用于系统通知正文与读屏', () => {
    const base = { id: 'x', projectId: 'P', projectName: '项目 P', projectOrder: 0, at: 0, read: false };
    expect(notificationText({ ...base, body: { type: 'changes', changes: [added, modified] } })).toBe('新增 1、修改 1：X');
    expect(notificationText({ ...base, body: { type: 'error', reason: '路径失效' } })).toBe('路径失效');
    expect(notificationText({ ...base, body: { type: 'recovered' } })).toBe('实时监听已恢复');
  });
});

test('groupByDay 保持原顺序，按 今天 / 昨天 / 更早 分组并跳过空组', () => {
  const now = new Date(2026, 9, 12, 15, 0).getTime();
  const n = (id: string, at: number): AppNotification => ({
    id,
    projectId: 'P',
    projectName: 'P',
    projectOrder: 0,
    at,
    read: true,
    body: { type: 'recovered' },
  });
  const items = [n('a', new Date(2026, 9, 12, 14, 0).getTime()), n('b', new Date(2026, 9, 12, 9, 0).getTime()), n('c', new Date(2026, 9, 1).getTime())];
  expect(groupByDay(items, now).map(([label, list]) => [label, list.map((x) => x.id)])).toEqual([
    ['今天', ['a', 'b']],
    ['更早', ['c']],
  ]);
});
