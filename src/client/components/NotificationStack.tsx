import { useEffect, useRef, useState, type FocusEvent } from 'react';
import type { AppNotification } from '../notifications/types';
import { NotificationCard } from './NotificationCard';

export const MAX_VISIBLE_TOASTS = 3;
/** 每张卡片停留时长；与 styles/index.css 里 --animate-toast-timer 的 6s 一致 */
export const TOAST_MS = 6000;

export type NotificationStackProps = {
  /** 弹出队列（含排队中的），只显示前 MAX_VISIBLE_TOASTS 张 */
  items: readonly AppNotification[];
  onDismiss: (id: string) => void;
  onOpenProject: (notification: AppNotification) => void;
  onOpenNote: (notification: AppNotification, noteId: string) => void;
};

type TimedToastProps = Omit<NotificationStackProps, 'items'> & { notification: AppNotification };

/** 一张带倒计时的卡片：鼠标停留或焦点在卡片内时暂停，离开后按剩余时间继续 */
function TimedToast({ notification, onDismiss, onOpenProject, onOpenNote }: TimedToastProps) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(TOAST_MS);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(notification.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [paused, notification.id, onDismiss]);

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
  };

  return (
    <div
      className="pointer-events-auto animate-slide-in-right"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={onBlur}
    >
      <NotificationCard
        notification={notification}
        variant="toast"
        paused={paused}
        onDismiss={onDismiss}
        onOpenProject={onOpenProject}
        onOpenNote={onOpenNote}
      />
    </div>
  );
}

/**
 * 右上角弹出栈（顶栏下方）。外层的 aria-live 区域始终存在，新增的卡片才会被读屏播报。
 * 与右下角的 Toaster（操作回执）分开：这里只放外部变更。
 */
export function NotificationStack({ items, ...handlers }: NotificationStackProps) {
  return (
    <div
      role="region"
      aria-label="变更通知"
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed top-16 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2"
    >
      {items.slice(0, MAX_VISIBLE_TOASTS).map((n) => (
        <TimedToast key={n.id} notification={n} {...handlers} />
      ))}
    </div>
  );
}
