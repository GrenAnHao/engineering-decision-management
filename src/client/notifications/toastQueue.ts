import type { AppNotification } from './types';

/** 同时显示的弹出卡片数；其余排队 */
export const MAX_VISIBLE_TOASTS = 3;
/** 队列上限（含正在显示的），必须不小于 MAX_VISIBLE_TOASTS：页面开着但人不在时，回来不至于被几十张卡片轮番轰炸 */
export const MAX_QUEUED_TOASTS = 10;

/** 新卡片入队（incoming 内部重复的也只留第一张）；超出上限时丢弃排队中最旧的，正在显示的前几张保留 */
export function enqueueToasts(queue: readonly AppNotification[], incoming: readonly AppNotification[]): AppNotification[] {
  const known = new Set(queue.map((n) => n.id));
  const next = [...queue];
  for (const n of incoming) {
    if (known.has(n.id)) continue;
    known.add(n.id);
    next.push(n);
  }
  if (next.length <= MAX_QUEUED_TOASTS) return next;
  // 起点用 length - 排队名额 而非 slice(-名额)：名额为 0 时 slice(-0) 会取回整个数组
  const waitingFrom = next.length - (MAX_QUEUED_TOASTS - MAX_VISIBLE_TOASTS);
  return [...next.slice(0, MAX_VISIBLE_TOASTS), ...next.slice(waitingFrom)];
}

export type IncomingRoute = 'desktop' | 'read' | 'toast';

/**
 * 新通知到达时怎么处理：
 * - 页面在后台 → 系统通知（抽屉开着也一样，且不标已读：人不在，回来要看到角标与「新」）；
 * - 页面可见且抽屉开着 → 直接出现在列表里，标为已读；
 * - 其余 → 弹卡片。
 */
export function routeIncoming({ drawerOpen, hidden }: { drawerOpen: boolean; hidden: boolean }): IncomingRoute {
  if (hidden) return 'desktop';
  return drawerOpen ? 'read' : 'toast';
}
