import { afterEach, beforeEach, expect, test } from 'bun:test';
import {
  clearNotifications,
  dismissNotification,
  markAllRead,
  MAX_NOTIFICATIONS,
  pushNotifications,
  readNotifications,
  resetNotificationStoreForTest,
  subscribeNotifications as subscribe,
} from '../../src/client/notifications/store';
import type { AppNotification } from '../../src/client/notifications/types';

const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function stubStorage(broken = false) {
  const data = new Map<string, string>();
  const fail = () => {
    if (broken) throw new Error('storage disabled');
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (fail(), data.get(k) ?? null),
      setItem: (k: string, v: string) => (fail(), void data.set(k, v)),
      removeItem: (k: string) => (fail(), void data.delete(k)),
    },
  });
  return data;
}

const n = (id: string, at = 0): AppNotification => ({
  id,
  projectId: 'P',
  projectName: 'P',
  projectOrder: 0,
  at,
  read: false,
  body: { type: 'recovered' },
});

beforeEach(() => {
  stubStorage();
  resetNotificationStoreForTest();
});

afterEach(() => {
  resetNotificationStoreForTest(); // 清掉模块里的内存兜底与读失败标记
  if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

test('新通知排在最前，返回真正新增的那些；重复 id 被忽略', () => {
  expect(pushNotifications([n('a')]).map((x) => x.id)).toEqual(['a']);
  expect(pushNotifications([n('b'), n('a')]).map((x) => x.id)).toEqual(['b']);
  expect(readNotifications().map((x) => x.id)).toEqual(['b', 'a']);
  expect(pushNotifications([n('a')])).toEqual([]);
});

test('同一批里重复的 id 只存一条', () => {
  expect(pushNotifications([n('a'), n('a'), n('b')]).map((x) => x.id)).toEqual(['a', 'b']);
  expect(readNotifications().map((x) => x.id)).toEqual(['a', 'b']);
});

test('写入 localStorage 并能读回（模拟刷新页面）', () => {
  const data = stubStorage();
  pushNotifications([n('a', 5)]);
  expect(JSON.parse(data.get('edm-notifications')!)).toEqual([n('a', 5)]);
});

test(`最多保留 ${MAX_NOTIFICATIONS} 条，超出时丢弃最旧的`, () => {
  pushNotifications(Array.from({ length: MAX_NOTIFICATIONS }, (_, i) => n(`old-${i}`)));
  pushNotifications([n('new')]);
  const items = readNotifications();
  expect(items).toHaveLength(MAX_NOTIFICATIONS);
  expect(items[0]!.id).toBe('new');
  expect(items.at(-1)!.id).toBe(`old-${MAX_NOTIFICATIONS - 2}`);
});

test('清除不存在的条目或空列表时不写盘也不通知', () => {
  const data = stubStorage();
  let emitted = 0;
  const unsubscribe = subscribe(() => emitted++);
  dismissNotification('nope');
  clearNotifications();
  expect(data.size).toBe(0);
  expect(emitted).toBe(0);
  pushNotifications([n('a')]);
  expect(emitted).toBe(1);
  dismissNotification('nope');
  expect(emitted).toBe(1);
  unsubscribe();
});

test('单条清除与全部清除', () => {
  pushNotifications([n('a'), n('b')]);
  dismissNotification('a');
  expect(readNotifications().map((x) => x.id)).toEqual(['b']);
  clearNotifications();
  expect(readNotifications()).toEqual([]);
});

test('全部已读', () => {
  pushNotifications([n('a'), n('b')]);
  markAllRead();
  expect(readNotifications().every((x) => x.read)).toBe(true);
});

test('没有变化时快照引用不变（useSyncExternalStore 依赖这一点）', () => {
  pushNotifications([n('a')]);
  expect(readNotifications()).toBe(readNotifications());
});

test('结构不合法的条目被过滤，合法条目保留', () => {
  const data = stubStorage();
  const withBody = (body: unknown) => ({ ...n('bad'), body });
  const goodChange = { kind: 'added', id: 'i', title: 't', lifecycle: 'implemented' };
  const goodMove = { kind: 'moved', id: 'i', fromId: 'j', title: 't', from: 'proposed', to: 'implemented' };
  data.set(
    'edm-notifications',
    JSON.stringify([
      withBody({ type: 'changes' }),
      withBody({ type: 'changes', changes: 'x' }),
      withBody({ type: 'mystery' }),
      withBody({ type: 'error' }),
      withBody({ type: 'changes', changes: [goodChange, { kind: 'added', id: 'i', title: 't' }] }),
      withBody({ type: 'changes', changes: [{ kind: 'moved', id: 'i', title: 't', from: 'a', to: 'b' }] }),
      withBody({ type: 'changes', changes: [{ kind: 'renamed', id: 'i', title: 't', lifecycle: 'x' }] }),
      withBody({ type: 'changes', changes: [null] }),
      withBody({ type: 'changes', changes: [] }),
      withBody({ type: 'changes', changes: [{ ...goodChange, lifecycle: 'draft' }] }),
      withBody({ type: 'changes', changes: [{ ...goodMove, to: 'draft' }] }),
      withBody({ type: 'changes', changes: [{ ...goodMove, from: 5 }] }),
      withBody({ type: 'changes', changes: [goodChange], total: '3' }),
      { ...n('ok-changes'), body: { type: 'changes', changes: [goodChange, goodMove], total: 2 } },
      { ...n('ok-error'), body: { type: 'error', reason: '坏了' } },
      n('ok-recovered'),
    ]),
  );
  expect(readNotifications().map((x) => x.id)).toEqual(['ok-changes', 'ok-error', 'ok-recovered']);
});

test('localStorage 里是损坏的 JSON 或非数组时当作空列表', () => {
  const data = stubStorage();
  data.set('edm-notifications', '{oops');
  expect(readNotifications()).toEqual([]);
  data.set('edm-notifications', '{"a":1}');
  expect(readNotifications()).toEqual([]);
  data.set('edm-notifications', JSON.stringify([n('ok'), { id: 1 }, null]));
  expect(readNotifications().map((x) => x.id)).toEqual(['ok']);
});

test('读失败后进入内存模式：存储恢复也不会覆盖磁盘上的历史，快照引用稳定', () => {
  const disk = new Map([['edm-notifications', JSON.stringify([n('history')])]]);
  stubStorage(true);
  expect(readNotifications()).toEqual([]);
  pushNotifications([n('a')]);
  expect(readNotifications().map((x) => x.id)).toEqual(['a']);
  expect(readNotifications()).toBe(readNotifications());

  // 存储恢复：换回一个读写正常、里面还有原始数据的 stub
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => disk.get(k) ?? null,
      setItem: (k: string, v: string) => void disk.set(k, v),
      removeItem: (k: string) => void disk.delete(k),
    },
  });
  pushNotifications([n('b')]);
  markAllRead();
  expect(readNotifications().map((x) => x.id)).toEqual(['b', 'a']);
  expect(JSON.parse(disk.get('edm-notifications')!)).toEqual([n('history')]);
});

test('读失败时保留此前已读到的历史', () => {
  pushNotifications([n('a')]);
  expect(readNotifications().map((x) => x.id)).toEqual(['a']);
  stubStorage(true);
  expect(readNotifications().map((x) => x.id)).toEqual(['a']);
  pushNotifications([n('b')]);
  expect(readNotifications().map((x) => x.id)).toEqual(['b', 'a']);
});

test('localStorage 不可用时存在内存里，本次会话内照常使用', () => {
  stubStorage(true);
  expect(readNotifications()).toEqual([]);
  pushNotifications([n('a')]);
  expect(readNotifications().map((x) => x.id)).toEqual(['a']);
  markAllRead();
  expect(readNotifications()[0]!.read).toBe(true);
});

test('旧数据没有 total：读取时补成 changes.length；脏的 total（小于明细条数）同样回退', () => {
  const data = stubStorage();
  const change = { kind: 'added', id: 'i', title: 't', lifecycle: 'implemented' };
  const stored = (id: string, extra: object) => ({ ...n(id), body: { type: 'changes', changes: [change, change], ...extra } });
  data.set('edm-notifications', JSON.stringify([stored('legacy', {}), stored('truncated', { total: 120 }), stored('dirty', { total: 1 })]));
  const bodies = readNotifications().map((x) => (x.body.type === 'changes' ? x.body.total : null));
  expect(bodies).toEqual([2, 120, 2]);
  expect(readNotifications()).toBe(readNotifications());
});

test('写入时按原样存下 total', () => {
  const body: AppNotification['body'] = { type: 'changes', changes: [{ kind: 'added', id: 'i', title: 't', lifecycle: 'implemented' }], total: 80 };
  pushNotifications([{ ...n('big'), body }]);
  expect(readNotifications()[0]!.body).toEqual(body);
});
