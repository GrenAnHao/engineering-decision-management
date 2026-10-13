import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './tw';

/** 加载骨架：渐变扫光 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-xl bg-linear-to-r from-surface-2 via-surface-3 to-surface-2 bg-[length:200%_100%] ring-1 ring-line',
        className,
      )}
      {...props}
    />
  );
}

/** 首屏加载占位：四张指标卡 + 一块大面板，与架构基线的版式对应 */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">加载中…</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[8.5rem]" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** 紧凑模式：用于列表内部的「没有数据」，不画虚线框 */
  compact?: boolean;
  className?: string;
};

/** 空态 / 错误态：图标 + 标题 + 说明 + 可选操作 */
export function EmptyState({ icon: Icon, title, children, action, compact, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 text-center',
        compact ? 'px-4 py-10' : 'rounded-xl border border-dashed border-line-strong bg-surface px-8 py-14',
        className,
      )}
    >
      {Icon && (
        <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-fg-subtle ring-1 ring-line">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      )}
      <h2 className="font-display text-base font-bold text-fg">{title}</h2>
      {children && <div className="max-w-xl text-sm leading-relaxed text-fg-muted">{children}</div>}
      {action}
    </div>
  );
}
