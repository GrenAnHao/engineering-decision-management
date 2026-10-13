import type { ComponentProps } from 'react';
import { cn } from './tw';

/** 快捷键键帽 */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-surface-2 px-1 font-mono text-2xs font-medium text-fg-subtle ring-1 ring-line-strong ring-inset',
        className,
      )}
      {...props}
    />
  );
}

/** 当前平台的修饰键写法：macOS 用 ⌘，其余用 Ctrl */
export const MOD_KEY_LABEL =
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
