import { useCallback, useEffect, useRef, useState } from 'react';
import { showDesktopNotification } from './desktop';
import { addHighlights, snapshotUnread } from './highlight';
import { markAllRead, pushNotifications, readNotifications } from './store';
import { routeIncoming } from './routing';
import { enqueueToasts } from './toastQueue';
import type { AppNotification } from './types';

export type OpenNotification = (notification: AppNotification, noteId: string | null) => void;

export type NotificationCenter = {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** 弹出队列（含排队中的），NotificationStack 只显示前几张 */
  toasts: readonly AppNotification[];
  dismissToast: (id: string) => void;
  /** 本次打开抽屉期间要标「新」的通知 id：标已读之前拍下的未读快照，加上抽屉开着时到达的 */
  highlighted: ReadonlySet<string>;
  /** 交给 useHub：入库，再按页面状态决定弹卡片、发系统通知还是只累加角标 */
  receive: (items: readonly AppNotification[]) => void;
  /** 点击卡片或系统通知：关闭抽屉、收起该卡片，再交给 onOpen 跳转 */
  activate: OpenNotification;
};

/**
 * 变更通知的前端调度：通知抽屉开关、右上角弹出队列，以及新通知到达时的分流（规则见 routing.routeIncoming）。
 */
const EMPTY_HIGHLIGHTS: ReadonlySet<string> = new Set();

type SetHighlighted = (update: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void;

/** 抽屉开着时标已读：先把当时未读的（以及 extra 里的）id 记进高亮，再 markAllRead，「新」才不会一闪就没 */
function highlightThenMarkRead(setHighlighted: SetHighlighted, extra: readonly string[] = []): void {
  const ids = [...snapshotUnread(readNotifications()), ...extra];
  setHighlighted((prev) => addHighlights(prev, ids));
  markAllRead();
}

export function useNotificationCenter(onOpen: OpenNotification): NotificationCenter {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<readonly AppNotification[]>([]);
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(EMPTY_HIGHLIGHTS);
  const drawerOpenRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });

  // 抽屉开着时切到后台收到的通知保持未读（见 routeIncoming）；回到前台、抽屉仍开着时，它们已经摆在眼前，补标已读
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && drawerOpenRef.current) highlightThenMarkRead(setHighlighted);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const closeDrawer = useCallback(() => {
    drawerOpenRef.current = false;
    setDrawerOpen(false);
    setHighlighted(EMPTY_HIGHLIGHTS);
  }, []);

  const openDrawer = useCallback(() => {
    drawerOpenRef.current = true;
    setDrawerOpen(true);
    setToasts([]);
    setHighlighted(snapshotUnread(readNotifications()));
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
          // 抽屉开着且人在看：新通知直接出现在列表里，标已读，本次打开期间仍显示「新」
          highlightThenMarkRead(setHighlighted, items.map((n) => n.id));
          return;
        case 'toast':
          setToasts((list) => enqueueToasts(list, items));
      }
    },
    [activate],
  );

  return { drawerOpen, openDrawer, closeDrawer, toasts, dismissToast, highlighted, receive, activate };
}
