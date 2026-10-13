import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { cn } from './tw';

export type DrawerProps = {
  /** 读屏用的对话框名称 */
  label: string;
  /** 指向标题元素的 id；有标题时读屏优先读它 */
  labelledBy?: string;
  /** 宽度、底色等，追加到侧边面板上 */
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

/** 打开时聚焦面板内带 data-autofocus 的元素，卸载时把焦点还给打开前的元素 */
function useDialogFocus(container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const prev = document.activeElement;
    container.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => (prev as HTMLElement | null)?.focus?.();
  }, [container]);
}

/**
 * Esc 关闭抽屉。命令面板已用 Esc 关了自己（defaultPrevented）、正在输入法组合、
 * 或头上还压着一个打开的模态框（添加 / 重命名 / 确认对话框）时，都不关抽屉：一次 Esc 只关最上面那一层。
 */
function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      if (document.querySelector('dialog[open]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** aria-modal 的抽屉要把 Tab 困在里面：到末尾回到开头，到开头 Shift+Tab 回到末尾，焦点不会漏到被遮住的页面上 */
function useFocusTrap() {
  const ref = useRef<HTMLElement>(null);
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return { ref, onKeyDown };
}

/** 右侧抽屉外壳：遮罩（点击关闭）+ 模态侧边面板（焦点陷阱、Esc 关闭、焦点归还） */
export function Drawer({ label, labelledBy, className, onClose, children }: DrawerProps) {
  const trap = useFocusTrap();
  useDialogFocus(trap.ref);
  useEscapeClose(onClose);
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-50 animate-fade-in bg-(--backdrop) backdrop-blur-[2px]" onClick={onClose} />
      <aside
        ref={trap.ref}
        onKeyDown={trap.onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        className={cn('fixed inset-y-0 right-0 z-[51] flex animate-slide-in-right flex-col bg-surface shadow-pop ring-1 ring-line-strong', className)}
      >
        {children}
      </aside>
    </>
  );
}
