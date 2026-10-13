import { BellOff, BellRing, X } from 'lucide-react';
import { useState } from 'react';
import { desktopPermission, requestDesktopPermission, type DesktopPermission } from '../notifications/desktop';
import { groupByDay } from '../notifications/derive';
import type { AppNotification } from '../notifications/types';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { EmptyState } from '../ui/State';
import { NotificationCard } from './NotificationCard';

export type NotificationDrawerProps = {
  items: readonly AppNotification[];
  /** 本次打开期间标「新」的通知 id（打开时的未读快照 + 打开期间到达的） */
  highlighted: ReadonlySet<string>;
  onClose: () => void;
  onClearAll: () => void;
  onDismiss: (id: string) => void;
  onOpenProject: (notification: AppNotification) => void;
  onOpenNote: (notification: AppNotification, noteId: string) => void;
};

const PERMISSION_TEXT: Record<Exclude<DesktopPermission, 'unsupported'>, string> = {
  default: '页面在后台时用系统通知提醒',
  granted: '系统通知已开启',
  denied: '系统通知被浏览器拦截，可在地址栏左侧的站点设置中允许',
};

function DesktopPermissionBar() {
  const [permission, setPermission] = useState<DesktopPermission>(desktopPermission);
  if (permission === 'unsupported') return null;
  const request = () => {
    requestDesktopPermission()
      .then(setPermission)
      .catch(() => setPermission(desktopPermission()));
  };
  return (
    <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-xs text-fg-muted shadow-card ring-1 ring-line">
      <BellRing aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
      <span className="flex-1 leading-relaxed">{PERMISSION_TEXT[permission]}</span>
      {permission === 'default' && (
        <Button variant="primary" size="sm" onClick={request}>
          开启
        </Button>
      )}
    </div>
  );
}

export function NotificationDrawer({ items, highlighted, onClose, onClearAll, onDismiss, onOpenProject, onOpenNote }: NotificationDrawerProps) {
  const now = Date.now();
  return (
    <Drawer label="通知" labelledBy="notification-drawer-title" className="w-[min(100vw,26rem)] bg-(--bg)" onClose={onClose}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
        <h2 id="notification-drawer-title" className="font-display text-[15px] font-bold text-fg">
          通知
        </h2>
        <span className="tabular font-mono text-2xs text-fg-subtle">{items.length} 条</span>
        <Button variant="ghost" size="sm" className="ml-auto" disabled={items.length === 0} onClick={onClearAll}>
          全部清除
        </Button>
        <Button data-autofocus variant="ghost" size="icon" className="-mr-2" title="关闭 (Esc)" aria-label="关闭" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </header>
      <DesktopPermissionBar />
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
        {items.length === 0 ? (
          <EmptyState compact icon={BellOff} title="暂无通知">
            项目里的笔记有新增、修改、迁移或删除时，会在这里列出。
          </EmptyState>
        ) : (
          groupByDay(items, now).map(([label, list]) => (
            <section key={label} aria-label={label}>
              <h3 className="px-1 pt-4 pb-2 text-2xs font-bold tracking-wide text-fg-subtle">{label}</h3>
              <div className="flex flex-col gap-2">
                {list.map((n) => (
                  <NotificationCard
                    key={n.id}
                    notification={n}
                    variant="drawer"
                    now={now}
                    highlighted={highlighted.has(n.id)}
                    onDismiss={onDismiss}
                    onOpenProject={onOpenProject}
                    onOpenNote={onOpenNote}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </Drawer>
  );
}
