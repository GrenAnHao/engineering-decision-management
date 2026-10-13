import { useMemo, useSyncExternalStore } from 'react';
import { isLifecycle } from '../../shared/types';
import type { AppNotification } from './types';

const STORAGE_KEY = 'edm-notifications';
export const MAX_NOTIFICATIONS = 200;

const EMPTY: AppNotification[] = [];
const listeners = new Set<() => void>();

/** localStorage 不可用（隐私模式、被禁用、写满）时退回内存，本次会话内照常使用 */
let memory: AppNotification[] | null = null;
/** 读取就失败过：之后不再写 localStorage，免得存储恢复后拿残缺的内存列表覆盖磁盘上的历史 */
let storageBroken = false;
/** 按原始字符串缓存解析结果：useSyncExternalStore 要求没有变化时返回同一个引用 */
let cache: { raw: string | null; items: AppNotification[] } = { raw: null, items: EMPTY };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const isString = (value: unknown): value is string => typeof value === 'string';
const isLifecycleValue = (value: unknown): boolean => isString(value) && isLifecycle(value);

function isNoteChange(value: unknown): boolean {
  if (!isRecord(value) || !isString(value.id) || !isString(value.title)) return false;
  switch (value.kind) {
    case 'added':
    case 'modified':
    case 'removed':
      return isLifecycleValue(value.lifecycle);
    case 'moved':
      return isString(value.fromId) && isLifecycleValue(value.from) && isLifecycleValue(value.to);
    default:
      return false;
  }
}

function isBody(value: unknown): boolean {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'changes':
      return Array.isArray(value.changes) && value.changes.length > 0 && value.changes.every(isNoteChange);
    case 'error':
      return isString(value.reason);
    case 'recovered':
      return true;
    default:
      return false;
  }
}

function isNotification(value: unknown): value is AppNotification {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.projectId) &&
    isString(value.projectName) &&
    typeof value.projectOrder === 'number' &&
    typeof value.at === 'number' &&
    typeof value.read === 'boolean' &&
    isBody(value.body)
  );
}

function parse(raw: string | null): AppNotification[] {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isNotification) : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function readNotifications(): AppNotification[] {
  if (memory) return memory;
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // 保留此前读到的历史，别让列表突然变空。readNotifications 作为 getSnapshot 会在渲染时改模块状态，
    // 但这一步幂等（再次进入只是重复赋同一个值），没有危害；write 总是生成新数组，共享 cache.items 是安全的
    storageBroken = true;
    memory = cache.items;
    return memory;
  }
  if (raw !== cache.raw) cache = { raw, items: parse(raw) };
  return cache.items;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function write(items: AppNotification[]): void {
  if (storageBroken) {
    memory = items;
  } else {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      memory = null;
    } catch {
      memory = items;
    }
  }
  emit();
}

/** 入库并返回真正新增的那些（id 已存在的被忽略：另一个标签页已经写过） */
export function pushNotifications(incoming: readonly AppNotification[]): AppNotification[] {
  const current = readNotifications();
  const known = new Set(current.map((n) => n.id));
  const fresh: AppNotification[] = [];
  for (const n of incoming) {
    if (known.has(n.id)) continue;
    known.add(n.id);
    fresh.push(n);
  }
  if (fresh.length > 0) write([...fresh, ...current].slice(0, MAX_NOTIFICATIONS));
  return fresh;
}

export function dismissNotification(id: string): void {
  const current = readNotifications();
  if (!current.some((n) => n.id === id)) return;
  write(current.filter((n) => n.id !== id));
}

export function clearNotifications(): void {
  if (readNotifications().length === 0) return;
  write([]);
}

export function markAllRead(): void {
  const current = readNotifications();
  if (current.every((n) => n.read)) return;
  write(current.map((n) => (n.read ? n : { ...n, read: true })));
}

/** 仅供测试：丢掉模块里的内存兜底、读失败标记与解析缓存，不碰 localStorage */
export function resetNotificationStoreForTest(): void {
  memory = null;
  storageBroken = false;
  cache = { raw: null, items: EMPTY };
}

if (typeof window !== 'undefined') {
  // 其他标签页改了通知（新增 / 清除 / 已读）时同步
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return;
    try {
      if (e.storageArea !== localStorage) return;
    } catch {
      return;
    }
    emit();
  });
}

export function subscribeNotifications(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNotifications(): { items: AppNotification[]; unread: number } {
  const items = useSyncExternalStore(subscribeNotifications, readNotifications, () => EMPTY);
  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);
  return { items, unread };
}
