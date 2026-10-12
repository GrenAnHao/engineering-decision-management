import type { KeyboardEvent } from 'react';

/** 让非按钮元素（保留原有块级布局的卡片、行）可被键盘聚焦与 Enter/Space 激活 */
export function clickable(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
