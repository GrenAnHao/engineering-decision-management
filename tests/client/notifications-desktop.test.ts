import { afterEach, beforeEach, expect, test } from 'bun:test';
import { desktopPermission, desktopText, errorCategory, showDesktopNotification } from '../../src/client/notifications/desktop';
import type { AppNotification } from '../../src/client/notifications/types';

const n: AppNotification = {
  id: 'n1',
  projectId: 'P',
  projectName: '工程决策中心',
  projectOrder: 1,
  at: 0,
  read: false,
  body: { type: 'recovered' },
};

const calls: string[] = [];
let constructed: { title: string; options: unknown }[] = [];
let instances: { onclick: (() => void) | null }[] = [];

function defineGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function stubNotification(permission: string) {
  class FakeNotification {
    static permission = permission;
    onclick: (() => void) | null = null;
    constructor(title: string, options: unknown) {
      constructed.push({ title, options });
      instances.push(this);
    }
    close() {
      calls.push('close');
    }
  }
  defineGlobal('Notification', FakeNotification);
}

const saved = new Map<string, PropertyDescriptor | undefined>();
function save(name: string) {
  if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
}

beforeEach(() => {
  calls.length = 0;
  constructed = [];
  instances = [];
  save('Notification');
  save('window');
  defineGlobal('window', { focus: () => calls.push('focus') });
});

afterEach(() => {
  for (const [name, desc] of saved) {
    if (desc) Object.defineProperty(globalThis, name, desc);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  saved.clear();
});

test('没有 Notification 时权限为 unsupported', () => {
  delete (globalThis as Record<string, unknown>).Notification;
  expect(desktopPermission()).toBe('unsupported');
});

test('已授权：按项目名与 tag 构造，点击依次聚焦窗口、跳转、关闭', () => {
  stubNotification('granted');
  showDesktopNotification(n, () => calls.push('click'));
  expect(constructed).toEqual([{ title: '工程决策中心', options: { body: desktopText(n), tag: 'edm:P' } }]);
  instances[0]!.onclick?.();
  expect(calls).toEqual(['focus', 'click', 'close']);
});

test('权限为 default 或 denied 时不构造', () => {
  for (const permission of ['default', 'denied']) {
    stubNotification(permission);
    showDesktopNotification(n, () => {});
  }
  expect(constructed).toEqual([]);
});

test('构造抛错时静默跳过', () => {
  const Throwing = Object.assign(
    function () {
      throw new TypeError('Illegal constructor');
    },
    { permission: 'granted' },
  );
  defineGlobal('Notification', Throwing);
  expect(() => showDesktopNotification(n, () => {})).not.toThrow();
});

test('errorCategory 取第一个「：」之前的类别；没有「：」或类别为空时用通用说法', () => {
  expect(errorCategory("路径失效：ENOENT: no such file or directory, scandir 'C:\\Users\\x\\p'")).toBe('路径失效');
  expect(errorCategory('实时监听不可用，已切换为手动刷新：EMFILE')).toBe('实时监听不可用，已切换为手动刷新');
  expect(errorCategory('路径失效')).toBe('项目异常');
  expect(errorCategory("scandir 'C:\\Users\\x'")).toBe('项目异常');
  expect(errorCategory('：只有原因')).toBe('项目异常');
  expect(errorCategory('')).toBe('项目异常');
});

test('desktopText：异常只显示类别，变更与恢复照常', () => {
  const base = { id: 'x', projectId: 'P', projectName: 'P', projectOrder: 0, at: 0, read: false };
  const reason = "路径失效：ENOENT: scandir 'C:\\Users\\x\\p'";
  expect(desktopText({ ...base, body: { type: 'error', reason } })).toBe('路径失效');
  expect(desktopText({ ...base, body: { type: 'recovered' } })).toBe('实时监听已恢复');
  const change = { kind: 'added', id: 'a.md', title: 'X', lifecycle: 'implemented' } as const;
  expect(desktopText({ ...base, body: { type: 'changes', changes: [change], total: 1 } })).toBe('新增 1：X');
});

test('异常的系统通知正文不含本机路径', () => {
  stubNotification('granted');
  const body = { type: 'error', reason: "路径失效：scandir 'C:\\Users\\x\\p'" } as const;
  showDesktopNotification({ ...n, body }, () => {});
  expect(constructed).toEqual([{ title: '工程决策中心', options: { body: '路径失效', tag: 'edm:P' } }]);
});
