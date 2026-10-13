import { useMemo, useSyncExternalStore } from 'react';
import type { AppNotification } from './types';

const STORAGE_KEY = 'edm-notifications';
export const MAX_NOTIFICATIONS = 200;

const EMPTY: AppNotification[] = [];
const listeners = new Set<() => void>();

/** localStorage 不可用（隐私模式、被禁用、写满）时退回内存，本次会话内照常使用 */
let memory: AppNotification[] | null = null;
/** 按原始字符串缓存解析结果：useSyncExternalStore 要求没有变化时返回同一个引用 */
let cache: { raw: string | null; items: AppNotification[] } = { raw: null, items: EMPTY };

function isNotification(value: unknown): value is AppNotification {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.projectId === 'string' &&
    typeof v.projectName === 'string' &&
    typeof v.projectOrder === 'number' &&
    typeof v.at === 'number' &&
    typeof v.read === 'boolean' &&
    !!v.body &&
    typeof (v.body as { type?: unknown }).type === 'string'
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
    return EMPTY;
  }
  if (raw !== cache.raw) cache = { raw, items: parse(raw) };
  return cache.items;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function write(items: AppNotification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    memory = null;
  } catch {
    memory = items;
  }
  emit();
}

/** 入库并返回真正新增的那些（id 已存在的被忽略：另一个标签页已经写过） */
export function pushNotifications(incoming: readonly AppNotification[]): AppNotification[] {
  const current = readNotifications();
  const known = new Set(current.map((n) => n.id));
  const fresh = incoming.filter((n) => !known.has(n.id));
  if (fresh.length > 0) write([...fresh, ...current].slice(0, MAX_NOTIFICATIONS));
  return fresh;
}

export function dismissNotification(id: string): void {
  write(readNotifications().filter((n) => n.id !== id));
}

export function clearNotifications(): void {
  write([]);
}

export function markAllRead(): void {
  const current = readNotifications();
  if (current.every((n) => n.read)) return;
  write(current.map((n) => (n.read ? n : { ...n, read: true })));
}

if (typeof window !== 'undefined') {
  // 其他标签页改了通知（新增 / 清除 / 已读）时同步
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) emit();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNotifications(): { items: AppNotification[]; unread: number } {
  const items = useSyncExternalStore(subscribe, readNotifications, () => EMPTY);
  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);
  return { items, unread };
}
