import { afterEach, beforeEach, expect, test } from 'bun:test';
import {
  clearNotifications,
  dismissNotification,
  markAllRead,
  MAX_NOTIFICATIONS,
  pushNotifications,
  readNotifications,
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
  clearNotifications();
});

afterEach(() => {
  stubStorage();
  clearNotifications(); // 清掉模块里的内存兜底
  if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

test('新通知排在最前，返回真正新增的那些；重复 id 被忽略', () => {
  expect(pushNotifications([n('a')]).map((x) => x.id)).toEqual(['a']);
  expect(pushNotifications([n('b'), n('a')]).map((x) => x.id)).toEqual(['b']);
  expect(readNotifications().map((x) => x.id)).toEqual(['b', 'a']);
  expect(pushNotifications([n('a')])).toEqual([]);
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
      { ...n('ok-changes'), body: { type: 'changes', changes: [goodChange, goodMove] } },
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

test('localStorage 不可用时存在内存里，本次会话内照常使用', () => {
  stubStorage(true);
  expect(readNotifications()).toEqual([]);
  pushNotifications([n('a')]);
  expect(readNotifications().map((x) => x.id)).toEqual(['a']);
  markAllRead();
  expect(readNotifications()[0]!.read).toBe(true);
});
