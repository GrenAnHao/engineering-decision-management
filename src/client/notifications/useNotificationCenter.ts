import { useCallback, useEffect, useRef, useState } from 'react';
import { showDesktopNotification } from './desktop';
import { markAllRead, pushNotifications } from './store';
import { enqueueToasts, routeIncoming } from './toastQueue';
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

/**
 * 变更通知的前端调度：通知抽屉开关、右上角弹出队列，以及新通知到达时的分流（规则见 toastQueue.routeIncoming）。
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
      switch (routeIncoming({ drawerOpen: drawerOpenRef.current, hidden: document.visibilityState === 'hidden' })) {
        case 'desktop':
          for (const n of fresh) showDesktopNotification(n, () => activate(n, null));
          return;
        case 'read':
          markAllRead(); // 抽屉开着且人在看，新通知直接出现在列表里
          return;
        case 'toast':
          setToasts((list) => enqueueToasts(list, items));
      }
    },
    [activate],
  );

  return { drawerOpen, openDrawer, closeDrawer, toasts, dismissToast, receive, activate };
}
