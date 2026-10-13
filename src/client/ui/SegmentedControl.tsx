import type { LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from './tw';

export type SegmentOption<T extends string> = { value: T; label: string; icon: LucideIcon };

export type SegmentedControlProps<T extends string> = {
  /** nav：页面导航（<nav> + aria-current）；radio：单选（radiogroup + 方向键） */
  mode: 'nav' | 'radio';
  /** 整组的可访问名称 */
  label: string;
  value: T;
  /** 应保持引用稳定（模块常量或 useMemo），否则每次渲染都会重新测量 */
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  /** true：始终只显示图标；'below-lg'：lg 以下只显示图标。文字都会保留给读屏与 title */
  iconOnly?: boolean | 'below-lg';
  className?: string;
};

const KEY_STEPS: ReadonlyMap<string, number> = new Map([
  ['ArrowRight', 1],
  ['ArrowDown', 1],
  ['ArrowLeft', -1],
  ['ArrowUp', -1],
]);

/** 方向键对应的下一项；非方向键返回 null。value 不在 options 里时从第一项起算 */
export function nextOption<T extends string>(
  options: readonly SegmentOption<T>[],
  value: T,
  key: string,
): SegmentOption<T> | null {
  const step = KEY_STEPS.get(key);
  if (step === undefined || options.length === 0) return null;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return options[(index + step + options.length) % options.length] ?? null;
}

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
  const hasActive = options.some((o) => o.value === value);
  const buttons = () => [...(listRef.current?.querySelectorAll<HTMLElement>('[data-value]') ?? [])];

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[data-active="true"]');
      // 容器被 display:none 隐藏时宽度为 0，不更新：否则再显示时底板会从 0 宽度「长出来」
      if (!active || active.offsetWidth === 0) return;
      const next = { left: active.offsetLeft, width: active.offsetWidth };
      setPill((prev) => (prev && prev.left === next.left && prev.width === next.width ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const el of buttons()) observer.observe(el);
    return () => observer.disconnect();
  }, [value, options, iconOnly, radio]);

  // radio 组内用方向键移动并立即选中（WAI-ARIA radio group 约定），焦点跟着走
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!radio || e.altKey || e.ctrlKey || e.metaKey) return; // Alt+← 是浏览器后退，不能吞
    const next = nextOption(options, value, e.key);
    if (!next) return;
    e.preventDefault();
    onChange(next.value);
    buttons().find((el) => el.dataset.value === next.value)?.focus();
  };

  const Root = radio ? 'div' : 'nav';
  return (
    <Root
      ref={listRef}
      role={radio ? 'radiogroup' : undefined}
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
      {options.map((o, i) => {
        const Icon = o.icon;
        const active = o.value === value;
        const semantics = radio
          ? { role: 'radio' as const, 'aria-checked': active, tabIndex: active || (!hasActive && i === 0) ? 0 : -1 }
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
    </Root>
  );
}
