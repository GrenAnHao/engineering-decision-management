import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { cn } from './tw';

export type ToastKind = 'info' | 'success' | 'error';

export type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
};

const KIND_STYLE: Record<ToastKind, { icon: typeof Info; color: string }> = {
  info: { icon: Info, color: 'text-blue-600 dark:text-blue-400' },
  success: { icon: CircleCheck, color: 'text-emerald-600 dark:text-emerald-400' },
  error: { icon: CircleAlert, color: 'text-rose-600 dark:text-rose-400' },
};

export type ToasterProps = {
  toasts: readonly ToastItem[];
  onDismiss: (id: number) => void;
  /** 鼠标停在提示上 / 键盘聚焦到提示里：暂停自动消失 */
  onHold: () => void;
  /** 移开 / 失焦：重新开始倒计时 */
  onRelease: () => void;
};

/**
 * 提示列表。外层的 aria-live 区域始终存在，新增的提示才会被读屏器播报
 * （动态插入的 role=status 节点自己不一定会被播报）。
 */
export function Toaster({ toasts, onDismiss, onHold, onRelease }: ToasterProps) {
  return (
    <div
      role="region"
      aria-label="通知"
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {toasts.map((t) => {
        const { icon: Icon, color } = KIND_STYLE[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : undefined}
            onMouseEnter={onHold}
            onMouseLeave={onRelease}
            onFocus={onHold}
            onBlur={onRelease}
            className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl bg-surface p-3 pr-2 text-sm text-fg shadow-pop ring-1 ring-line-strong"
          >
            <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', color)} />
            <p className="min-w-0 flex-1 leading-relaxed break-words">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  onDismiss(t.id);
                }}
                className="shrink-0 rounded-md px-2 py-0.5 text-[13px] font-semibold text-accent-text transition-colors hover:bg-accent-soft"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => onDismiss(t.id)}
              className="grid size-6 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
