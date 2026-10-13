import { notificationText } from './derive';
import type { AppNotification } from './types';

/** 异常原因里第一个「：」之前的类别，如「路径失效」；后面通常是带本机路径的底层错误，不能出现在系统通知里 */
export function errorCategory(reason: string): string {
  const head = reason.slice(0, Math.max(0, reason.indexOf('：'))).trim();
  return head || '项目异常';
}

/** 系统通知正文：与应用内一致，但异常只给类别，免得本机绝对路径出现在锁屏 / 通知中心 */
export function desktopText(n: AppNotification): string {
  return n.body.type === 'error' ? errorCategory(n.body.reason) : notificationText(n);
}

export type DesktopPermission = NotificationPermission | 'unsupported';

export function desktopPermission(): DesktopPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** 必须在用户点击里调用（浏览器要求）；返回最终的权限状态 */
export async function requestDesktopPermission(): Promise<DesktopPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

/**
 * 发系统通知。同一项目用同一个 tag，新的替换旧的，不会在系统通知中心里堆积。
 * 点击时把窗口拉到前台，再交给 onClick 跳转。
 */
export function showDesktopNotification(n: AppNotification, onClick: () => void): void {
  if (desktopPermission() !== 'granted') return;
  try {
    const notification = new Notification(n.projectName, { body: desktopText(n), tag: `edm:${n.projectId}` });
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  } catch {
    // 个别环境（如安卓 Chrome）不允许直接构造 Notification，只能走 Service Worker；这里不支持，静默跳过
  }
}
