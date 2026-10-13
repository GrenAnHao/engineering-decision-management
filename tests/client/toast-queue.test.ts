import { describe, expect, test } from 'bun:test';
import { enqueueToasts, MAX_QUEUED_TOASTS, MAX_VISIBLE_TOASTS, routeIncoming } from '../../src/client/notifications/toastQueue';
import type { AppNotification } from '../../src/client/notifications/types';

const toast = (id: string): AppNotification => ({
  id,
  projectId: 'P',
  projectName: '项目 P',
  projectOrder: 0,
  at: 0,
  read: false,
  body: { type: 'recovered' },
});
const ids = (list: readonly AppNotification[]) => list.map((n) => n.id);
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => toast(`t${from + i}`));

describe('enqueueToasts', () => {
  test('队列上限不小于同时显示数（否则「保留正在显示的」无从谈起）', () => {
    expect(MAX_QUEUED_TOASTS).toBeGreaterThanOrEqual(MAX_VISIBLE_TOASTS);
  });

  test('未满时按到达顺序追加到队尾', () => {
    expect(ids(enqueueToasts([toast('a')], [toast('b'), toast('c')]))).toEqual(['a', 'b', 'c']);
  });

  test('队列里已有的 id 不重复入队', () => {
    expect(ids(enqueueToasts([toast('a'), toast('b')], [toast('b'), toast('c')]))).toEqual(['a', 'b', 'c']);
  });

  test('incoming 内部重复的 id 只入队一次', () => {
    expect(ids(enqueueToasts([], [toast('a'), toast('b'), toast('a')]))).toEqual(['a', 'b']);
  });

  test('超过上限时保留正在显示的前几张，丢掉排队中最旧的，最新的留下', () => {
    const queue = range(0, MAX_QUEUED_TOASTS);
    const next = enqueueToasts(queue, range(MAX_QUEUED_TOASTS, MAX_QUEUED_TOASTS + 2));

    expect(next).toHaveLength(MAX_QUEUED_TOASTS);
    expect(ids(next.slice(0, MAX_VISIBLE_TOASTS))).toEqual(ids(queue.slice(0, MAX_VISIBLE_TOASTS)));
    // 排队中最旧的两张（紧跟在显示区之后）被丢弃
    expect(ids(next)).not.toContain(`t${MAX_VISIBLE_TOASTS}`);
    expect(ids(next)).not.toContain(`t${MAX_VISIBLE_TOASTS + 1}`);
    expect(ids(next.slice(-2))).toEqual([`t${MAX_QUEUED_TOASTS}`, `t${MAX_QUEUED_TOASTS + 1}`]);
  });

  test('一次涌入远超上限时总长度仍等于上限，只留最新的那些排队', () => {
    const next = enqueueToasts(range(0, 2), range(2, 40));

    expect(next).toHaveLength(MAX_QUEUED_TOASTS);
    expect(ids(next.slice(0, MAX_VISIBLE_TOASTS))).toEqual(['t0', 't1', 't2']);
    expect(ids(next.slice(MAX_VISIBLE_TOASTS))).toEqual(ids(range(40 - (MAX_QUEUED_TOASTS - MAX_VISIBLE_TOASTS), 40)));
  });

  test('不改入参', () => {
    const queue = range(0, MAX_QUEUED_TOASTS);
    enqueueToasts(queue, [toast('new')]);
    expect(queue).toHaveLength(MAX_QUEUED_TOASTS);
  });
});

describe('routeIncoming', () => {
  test('页面在后台：发系统通知，抽屉开着也不标已读', () => {
    expect(routeIncoming({ hidden: true, drawerOpen: false })).toBe('desktop');
    expect(routeIncoming({ hidden: true, drawerOpen: true })).toBe('desktop');
  });

  test('页面可见且抽屉开着：直接标已读', () => {
    expect(routeIncoming({ hidden: false, drawerOpen: true })).toBe('read');
  });

  test('页面可见、抽屉关着：弹卡片', () => {
    expect(routeIncoming({ hidden: false, drawerOpen: false })).toBe('toast');
  });
});
