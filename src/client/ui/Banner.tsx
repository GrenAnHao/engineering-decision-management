import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import type { VariantProps } from 'tailwind-variants';
import { cn, tv } from './tw';

export const banner = tv({
  base: 'flex items-center gap-3 rounded-lg px-4 py-2.5 text-[13px] leading-relaxed font-medium ring-1 ring-inset',
  variants: {
    tone: {
      amber: 'bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300',
      rose: 'bg-rose-500/10 text-rose-700 ring-rose-600/20 dark:text-rose-300',
    },
  },
  defaultVariants: { tone: 'amber' },
});

export type BannerProps = VariantProps<typeof banner> & {
  icon?: LucideIcon;
  /** 右侧的操作（通常是一个小按钮） */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** rose 级别的提示用 alert，其余用 status */
  role?: 'alert' | 'status';
};

/** 行内提示条：更新提示、连接异常等需要用户留意但不打断的信息 */
export function Banner({ tone, icon: Icon, action, children, className, role }: BannerProps) {
  return (
    <div role={role ?? (tone === 'rose' ? 'alert' : 'status')} className={banner({ tone, className })}>
      {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

/** 配合 Banner 使用的小按钮，颜色跟随提示条 */
export function BannerButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'shrink-0 rounded-md bg-surface px-2.5 py-1 text-xs font-semibold text-fg shadow-card ring-1 ring-line-strong transition-colors ring-inset hover:bg-surface-2',
        className,
      )}
      {...props}
    />
  );
}
