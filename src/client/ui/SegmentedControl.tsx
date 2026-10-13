import type { LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from './tw';

export type SegmentOption<T extends string> = { value: T; label: string; icon: LucideIcon };

export type SegmentedControlProps<T extends string> = {
  /** nav：页面导航（aria-current）；radio：单选（radiogroup + 方向键） */
  mode: 'nav' | 'radio';
  /** 整组的可访问名称 */
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  /** true：始终只显示图标；'below-lg'：lg 以下只显示图标。文字都会保留给读屏与 title */
  iconOnly?: boolean | 'below-lg';
  className?: string;
};

const NEXT_KEYS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** 分段控件：一块滑动的底板跟随选中项，宽度随文字变化 */
export function SegmentedControl<T extends string>({
  mode,
  label,
  value,
  options,
  onChange,
  iconOnly = false,
  className,
}: SegmentedControlProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const radio = mode === 'radio';

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[data-active="true"]');
      if (active) setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value]);

  // radio 组内用方向键移动并立即选中（WAI-ARIA radio group 约定），焦点跟着走
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = NEXT_KEYS[e.key];
    if (!radio || !step) return;
    e.preventDefault();
    const index = options.findIndex((o) => o.value === value);
    const next = options[(index + step + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    listRef.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role={radio ? 'radiogroup' : 'navigation'}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('relative flex shrink-0 rounded-[10px] bg-surface-2 p-0.5 ring-1 ring-line ring-inset', className)}
    >
      {pill && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0.5 left-0 rounded-lg bg-surface shadow-raised ring-1 ring-line transition-[transform,width] duration-300 ease-out"
          style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
        />
      )}
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.value === value;
        const semantics = radio
          ? { role: 'radio' as const, 'aria-checked': active, tabIndex: active ? 0 : -1 }
          : { 'aria-current': active ? ('page' as const) : undefined };
        return (
          <button
            key={o.value}
            type="button"
            data-value={o.value}
            data-active={active}
            title={o.label}
            onClick={() => onChange(o.value)}
            {...semantics}
            className={cn(
              'relative z-10 inline-flex h-8 items-center gap-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors',
              iconOnly === true ? 'w-8 justify-center' : 'px-3',
              active ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            <Icon aria-hidden="true" className={cn('size-4 transition-colors', active && 'text-accent-text')} />
            <span className={cn(iconOnly === true && 'sr-only', iconOnly === 'below-lg' && 'max-lg:sr-only')}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
