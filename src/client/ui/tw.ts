import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { createTV } from 'tailwind-variants';

/** 让 tailwind-merge 认识 styles/index.css 里自定义的阴影，否则同类工具类不会互相覆盖 */
const twMergeConfig = {
  extend: {
    classGroups: {
      shadow: [{ shadow: ['card', 'raised', 'pop'] }],
    },
  },
} as const;

const merge = extendTailwindMerge(twMergeConfig);

/** 合并类名：clsx 处理条件，tailwind-merge 让后写的工具类覆盖先写的同类 */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}

/** 组件变体：与 cn 共用同一份 tailwind-merge 配置 */
export const tv = createTV({ twMergeConfig });
