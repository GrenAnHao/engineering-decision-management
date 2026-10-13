import { describe, expect, test } from 'bun:test';
import { enqueueToasts, MAX_QUEUED_TOASTS, MAX_VISIBLE_TOASTS } from '../../src/client/notifications/useNotificationCenter';
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
  test('未满时按到达顺序追加到队尾', () => {
    expect(ids(enqueueToasts([toast('a')], [toast('b'), toast('c')]))).toEqual(['a', 'b', 'c']);
  });

  test('队列里已有的 id 不重复入队', () => {
    expect(ids(enqueueToasts([toast('a'), toast('b')], [toast('b'), toast('c')]))).toEqual(['a', 'b', 'c']);
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
    const queue = range(0, 2);
    const next = enqueueToasts(queue, range(2, 40));

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
