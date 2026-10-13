import { useCallback, useEffect, useRef, useState } from 'react';
import { showDesktopNotification } from './desktop';
import { markAllRead, pushNotifications } from './store';
import type { AppNotification } from './types';

export type OpenNotification = (notification: AppNotification, noteId: string | null) => void;

export type NotificationCenter = {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** 弹出队列（含排队中的），NotificationStack 只显示前几张 */
  toasts: readonly AppNotification[];
  dismissToast: (id: string) => void;
  /** 交给 useHub：入库，再按页面状态决定弹卡片、发系统通知还是只累加角标 */
  receive: (items: readonly AppNotification[]) => void;
  /** 点击卡片或系统通知：关闭抽屉、收起该卡片，再交给 onOpen 跳转 */
  activate: OpenNotification;
};

/** 同时显示的弹出卡片数；其余排队。队列策略放在这一层，NotificationStack 反向引用 */
export const MAX_VISIBLE_TOASTS = 3;
/** 队列上限（含正在显示的）：页面开着但人不在时，回来不至于被几十张卡片轮番轰炸 */
export const MAX_QUEUED_TOASTS = 10;

/** 新卡片入队；超出上限时丢弃排队中最旧的，正在显示的前几张保留 */
export function enqueueToasts(queue: readonly AppNotification[], incoming: readonly AppNotification[]): AppNotification[] {
  const known = new Set(queue.map((n) => n.id));
  const next = [...queue, ...incoming.filter((n) => !known.has(n.id))];
  if (next.length <= MAX_QUEUED_TOASTS) return next;
  const visible = next.slice(0, MAX_VISIBLE_TOASTS);
  return [...visible, ...next.slice(MAX_VISIBLE_TOASTS).slice(-(MAX_QUEUED_TOASTS - MAX_VISIBLE_TOASTS))];
}

/**
 * 变更通知的前端调度：通知抽屉开关、右上角弹出队列，以及新通知到达时的分流
 * （抽屉开着 → 直接已读；页面在后台 → 系统通知；否则 → 弹卡片）。
 */
export function useNotificationCenter(onOpen: OpenNotification): NotificationCenter {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<readonly AppNotification[]>([]);
  const drawerOpenRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });

  const closeDrawer = useCallback(() => {
    drawerOpenRef.current = false;
    setDrawerOpen(false);
  }, []);

  const openDrawer = useCallback(() => {
    drawerOpenRef.current = true;
    setDrawerOpen(true);
    setToasts([]);
    markAllRead();
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const activate = useCallback<OpenNotification>(
    (n, noteId) => {
      closeDrawer();
      dismissToast(n.id);
      onOpenRef.current(n, noteId);
    },
    [closeDrawer, dismissToast],
  );

  const receive = useCallback(
    (items: readonly AppNotification[]) => {
      // fresh 只说明「谁先写进存储」，多个标签页之间是竞态，所以只拿它门控系统通知
      const fresh = pushNotifications(items);
      if (drawerOpenRef.current) return markAllRead(); // 抽屉开着，新通知直接出现在列表里
      if (document.visibilityState === 'hidden') {
        for (const n of fresh) showDesktopNotification(n, () => activate(n, null));
        return;
      }
      setToasts((list) => enqueueToasts(list, items));
    },
    [activate],
  );

  return { drawerOpen, openDrawer, closeDrawer, toasts, dismissToast, receive, activate };
}
