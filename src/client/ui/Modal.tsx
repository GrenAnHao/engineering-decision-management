import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from './tw';

export type ModalProps = {
  /** 读屏用的对话框名称 */
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** center：垂直居中（确认框）；top：靠上（命令面板，结果变多时不会上下跳） */
  align?: 'center' | 'top';
};

/**
 * 基于原生 <dialog> 的模态框：showModal() 自带焦点陷阱、背景惰性与 Esc 关闭请求。
 * 子元素里带 data-autofocus 的元素会在打开时获得焦点；关闭后焦点还给打开前的元素。
 * 内容必须铺满对话框（本身 padding 为 0），点击遮罩才能靠 target 判断出来。
 */
export function Modal({ label, onClose, children, className, align = 'center' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault(); // 由 React 状态决定何时卸载，避免先关后删的闪烁
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        'm-auto max-h-[85vh] w-[min(92vw,28rem)] overflow-visible rounded-2xl bg-surface p-0 text-fg shadow-pop ring-1 ring-line-strong',
        'open:animate-pop-in backdrop:animate-fade-in backdrop:bg-(--backdrop) backdrop:backdrop-blur-[2px]',
        align === 'top' && 'mt-[12vh] mb-auto',
        className,
      )}
    >
      {children}
    </dialog>
  );
}
