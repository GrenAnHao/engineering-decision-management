import type { ComponentProps } from 'react';
import type { VariantProps } from 'tailwind-variants';
import { tv } from './tw';

export const button = tv({
  base: 'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none transition-[background-color,box-shadow,color] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  variants: {
    variant: {
      primary: 'bg-accent text-accent-fg shadow-card hover:bg-accent-hover',
      secondary: 'bg-surface text-fg shadow-card ring-1 ring-line-strong ring-inset hover:bg-surface-2',
      ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      danger: 'bg-rose-600 text-white shadow-card hover:bg-rose-700',
    },
    size: {
      sm: 'h-8 px-3 text-[13px]',
      md: 'h-9 px-4 text-sm',
      icon: 'size-9',
    },
  },
  defaultVariants: { variant: 'secondary', size: 'md' },
});

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof button>;

export function Button({ variant, size, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={button({ variant, size, className })} {...props} />;
}
