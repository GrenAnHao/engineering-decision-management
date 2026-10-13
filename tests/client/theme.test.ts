import { afterEach, expect, test } from 'bun:test';
import { readPreference, resolveTheme, THEME_PREFERENCES, writePreference } from '../../src/client/theme';

const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

/** 一个内存版 localStorage；broken 为真时每次读写都抛错（隐私模式 / 被禁用） */
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

afterEach(() => {
  writePreference('system'); // 清掉模块里的内存兜底
  if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

test('跟随系统时取系统主题；显式选择不受系统影响', () => {
  expect(resolveTheme('system', true)).toBe('dark');
  expect(resolveTheme('system', false)).toBe('light');
  expect(resolveTheme('light', true)).toBe('light');
  expect(resolveTheme('dark', false)).toBe('dark');
});

test('三个主题选项按 跟随系统 / 浅色 / 深色 排列', () => {
  expect(THEME_PREFERENCES).toEqual(['system', 'light', 'dark']);
});

test('偏好写入 localStorage 并读回；选「跟随系统」时删除该项', () => {
  const data = stubStorage();
  writePreference('dark');
  expect(data.get('edm-theme')).toBe('dark');
  expect(readPreference()).toBe('dark');
  writePreference('system');
  expect(data.has('edm-theme')).toBe(false);
  expect(readPreference()).toBe('system');
});

test('localStorage 里是未知值时按跟随系统处理', () => {
  const data = stubStorage();
  data.set('edm-theme', 'purple');
  expect(readPreference()).toBe('system');
});

test('localStorage 不可用时偏好存在内存里，本次会话内仍然生效', () => {
  stubStorage(true);
  expect(readPreference()).toBe('system');
  writePreference('dark');
  expect(readPreference()).toBe('dark');
  writePreference('light');
  expect(readPreference()).toBe('light');
});
