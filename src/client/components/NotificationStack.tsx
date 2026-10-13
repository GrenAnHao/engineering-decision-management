import { useEffect, useState, type FocusEvent } from 'react';
import { createCountdown } from '../notifications/countdown';
import { notificationLabel } from '../notifications/derive';
import type { AppNotification } from '../notifications/types';
import { MAX_VISIBLE_TOASTS } from '../notifications/toastQueue';
import { NotificationCard } from './NotificationCard';

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

/** 一张带倒计时的卡片：鼠标停留或焦点在卡片内时暂停（两者分开记，任一成立就暂停），离开后按剩余时间继续 */
function TimedToast({ notification, onDismiss, onOpenProject, onOpenNote }: TimedToastProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const [countdown] = useState(() => createCountdown(TOAST_MS, Date.now()));

  useEffect(() => {
    if (paused) return;
    countdown.resume(Date.now());
    const timer = setTimeout(() => onDismiss(notification.id), countdown.remaining(Date.now()));
    return () => {
      clearTimeout(timer);
      countdown.pause(Date.now());
    };
  }, [paused, countdown, notification.id, onDismiss]);

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  };

  return (
    <div
      className="pointer-events-auto animate-slide-in-right"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
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
 * 右上角弹出栈（顶栏下方）。读屏播报与卡片分开：live 区域常驻，只放每张卡片的一句摘要（sr-only），
 * 否则插入整张 article 会把标题、每一行变更都读一遍；可交互的卡片放在另一个不带 aria-live 的容器里。
 * 与右下角的 Toaster（操作回执）分开：这里只放外部变更。
 */
export function NotificationStack({ items, ...handlers }: NotificationStackProps) {
  const visible = items.slice(0, MAX_VISIBLE_TOASTS);
  return (
    <div className="pointer-events-none fixed top-16 right-4 z-[60] w-[min(92vw,22rem)]">
      <div role="status" aria-live="polite" aria-relevant="additions" className="sr-only">
        {visible.map((n) => (
          <p key={n.id}>{notificationLabel(n)}</p>
        ))}
      </div>
      <div role="region" aria-label="变更通知" className="flex flex-col gap-2">
        {visible.map((n) => (
          <TimedToast key={n.id} notification={n} {...handlers} />
        ))}
      </div>
    </div>
  );
}
