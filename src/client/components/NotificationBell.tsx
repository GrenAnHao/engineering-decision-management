import { Bell } from 'lucide-react';
import { Button } from '../ui/Button';

/** 角标文字：没有未读返回 null，超过 99 显示 99+ */
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

export type NotificationBellProps = {
  unread: number;
  /** 通知抽屉是否打开 */
  open: boolean;
  onClick: () => void;
};

export function NotificationBell({ unread, open, onClick }: NotificationBellProps) {
  const badge = unreadBadge(unread);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      title="通知"
      aria-label={badge ? `通知，${unread} 条未读` : '通知'}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
    >
      <Bell aria-hidden="true" />
      {badge && (
        <span
          aria-hidden="true"
          className="tabular absolute top-1 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] leading-none font-bold text-white ring-2 ring-surface"
        >
          {badge}
        </span>
      )}
    </Button>
  );
}
