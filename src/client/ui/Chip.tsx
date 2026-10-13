import type { ComponentProps } from 'react';
import { cn } from './tw';

export type ToggleChipProps = Omit<ComponentProps<'button'>, 'aria-pressed'> & {
  pressed: boolean;
  /** 右侧的计数 */
  count?: number;
};

/** 筛选胶囊：选中态用 accent，未选中是安静的描边 */
export function ToggleChip({ pressed, count, className, children, type = 'button', ...props }: ToggleChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap ring-1 ring-inset transition-colors',
        pressed
          ? 'bg-accent-soft text-accent-text ring-accent/35'
          : 'bg-surface text-fg-muted ring-line-strong hover:bg-surface-2 hover:text-fg',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && <span className="tabular opacity-60">{count}</span>}
    </button>
  );
}
