import { ChevronDown, Search, X } from 'lucide-react';
import { useRef, type ComponentProps } from 'react';
import { cn } from './tw';

export const FIELD_CLASS =
  'h-9 w-full rounded-lg bg-surface text-sm text-fg shadow-card ring-1 ring-line-strong ring-inset transition-shadow placeholder:text-fg-subtle focus:outline-hidden focus:ring-2 focus:ring-accent';

export type SearchFieldProps = Omit<ComponentProps<'input'>, 'onChange' | 'value'> & {
  value: string;
  onValueChange: (value: string) => void;
  clearLabel?: string;
};

/** 带搜索图标与清除按钮的输入框 */
export function SearchField({ value, onValueChange, clearLabel = '清除', className, ...props }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={cn('relative flex items-center', className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-fg-subtle" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(FIELD_CLASS, 'pr-9 pl-9')}
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label={clearLabel}
          title={clearLabel}
          onClick={() => {
            onValueChange('');
            inputRef.current?.focus(); // 清除按钮随即卸载，焦点要回到输入框，否则落到 body
          }}
          className="absolute right-2 grid size-6 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** 原生 <select> 加自绘箭头：保留键盘与读屏行为，外观与输入框统一 */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative inline-flex', className)}>
      <select className={cn(FIELD_CLASS, 'cursor-pointer appearance-none pr-8 pl-3')} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
}
