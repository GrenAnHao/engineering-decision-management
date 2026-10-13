import { afterEach, beforeEach, expect, test } from 'bun:test';
import { desktopPermission, showDesktopNotification } from '../../src/client/notifications/desktop';
import { notificationText } from '../../src/client/notifications/derive';
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
  expect(constructed).toEqual([{ title: '工程决策中心', options: { body: notificationText(n), tag: 'edm:P' } }]);
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
