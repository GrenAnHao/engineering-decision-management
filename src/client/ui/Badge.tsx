import type { ComponentProps } from 'react';
import type { VariantProps } from 'tailwind-variants';
import { tv } from './tw';

/** 软底色徽标：十分之一透明度的底 + 描边环，浅色深色下都清晰 */
export const badge = tv({
  base: 'inline-flex w-max items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold whitespace-nowrap ring-1 ring-inset [&_svg]:size-3',
  variants: {
    tone: {
      neutral: 'bg-slate-500/10 text-slate-700 ring-slate-500/20 dark:text-slate-300 dark:ring-slate-400/25',
      blue: 'bg-blue-500/10 text-blue-700 ring-blue-600/20 dark:text-blue-300 dark:ring-blue-400/25',
      emerald: 'bg-emerald-500/10 text-emerald-800 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/25',
      amber: 'bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300 dark:ring-amber-400/25',
      rose: 'bg-rose-500/10 text-rose-700 ring-rose-600/20 dark:text-rose-300 dark:ring-rose-400/25',
      teal: 'bg-teal-500/10 text-teal-800 ring-teal-600/20 dark:text-teal-300 dark:ring-teal-400/25',
      purple: 'bg-purple-500/10 text-purple-700 ring-purple-600/20 dark:text-purple-300 dark:ring-purple-400/25',
      pink: 'bg-pink-500/10 text-pink-700 ring-pink-600/20 dark:text-pink-300 dark:ring-pink-400/25',
      orange: 'bg-orange-500/10 text-orange-800 ring-orange-600/25 dark:text-orange-300 dark:ring-orange-400/25',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type Tone = NonNullable<VariantProps<typeof badge>['tone']>;

/** 与徽标同色系的小圆点 / 色块，用于分类图例等 */
export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  teal: 'bg-teal-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  orange: 'bg-orange-500',
};

export function Badge({ tone, className, ...props }: ComponentProps<'span'> & VariantProps<typeof badge>) {
  return <span className={badge({ tone, className })} {...props} />;
}
