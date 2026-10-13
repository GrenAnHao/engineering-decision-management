import { TriangleAlert } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Button } from './Button';
import { FIELD_CLASS } from './Field';
import { Modal } from './Modal';
import { Toaster, type ToastItem, type ToastKind } from './Toaster';

export type PromptOptions = {
  title: string;
  description?: string;
  /** 输入框的可访问名称 */
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** 允许提交空字符串（如「留空恢复默认」） */
  allowEmpty?: boolean;
  /** 提交时执行；抛错则把错误显示在输入框下方并保持对话框打开，成功才关闭 */
  onSubmit?: (value: string) => Promise<unknown>;
};

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
};

export type ToastOptions = {
  kind?: ToastKind;
  message: string;
  action?: ToastItem['action'];
};

export type Dialogs = {
  /** 返回去掉首尾空白的输入值；用户取消返回 null */
  prompt: (options: PromptOptions) => Promise<string | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: (options: ToastOptions) => void;
};

type Pending =
  | { id: number; kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }
  | { id: number; kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void };

const MAX_TOASTS = 4;
const TOAST_MS = 4500;
const ERROR_TOAST_MS = 8000;
/** 带操作按钮的提示（如「撤销」）要留足时间让人够得着 */
const ACTION_TOAST_MS = 10_000;

const DialogsContext = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const dialogs = useContext(DialogsContext);
  if (!dialogs) throw new Error('useDialogs 必须在 <DialogProvider> 内使用');
  return dialogs;
}

function cancelPending(pending: Pending | null): void {
  if (!pending) return;
  if (pending.kind === 'prompt') pending.resolve(null);
  else pending.resolve(false);
}

function PromptDialog({ options, onDone }: { options: PromptOptions; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(options.initialValue ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const trimmed = value.trim();
  const canSubmit = !busy && (options.allowEmpty || trimmed !== '');
  // 提交请求还在途中时不允许取消：否则请求照常生效，界面却当作没发生过
  const cancel = () => {
    if (!busy) onDone(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (!options.onSubmit) return onDone(trimmed);
    setBusy(true);
    setError(null);
    try {
      await options.onSubmit(trimmed);
    } catch (err) {
      if (!mounted.current) return;
      setError((err as Error).message);
      setBusy(false);
      return;
    }
    if (mounted.current) onDone(trimmed);
  };

  return (
    <Modal label={options.title} onClose={cancel}>
      <form onSubmit={submit} className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-display text-base font-bold text-fg">{options.title}</h2>
          {options.description && <p className="mt-1 text-sm leading-relaxed text-fg-muted">{options.description}</p>}
        </div>
        <input
          data-autofocus
          type="text"
          aria-label={options.label}
          aria-invalid={error ? true : undefined}
          className={FIELD_CLASS}
          value={value}
          placeholder={options.placeholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
          }}
        />
        {error && (
          <p role="alert" className="-mt-2 text-[13px] leading-relaxed text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={cancel}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {busy ? '处理中…' : (options.confirmLabel ?? '确定')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmDialog({ options, onDone }: { options: ConfirmOptions; onDone: (value: boolean) => void }) {
  const danger = options.tone === 'danger';
  return (
    <Modal label={options.title} onClose={() => onDone(false)}>
      <div className="flex flex-col gap-5 p-5">
        <div className="flex gap-3">
          {danger && (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <TriangleAlert aria-hidden="true" className="size-[18px]" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold break-words text-fg">{options.title}</h2>
            {options.description && <div className="mt-1 text-sm leading-relaxed break-words text-fg-muted">{options.description}</div>}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {/* 危险操作默认聚焦「取消」，避免回车误删 */}
          <Button variant="ghost" data-autofocus={danger ? '' : undefined} onClick={() => onDone(false)}>
            取消
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} data-autofocus={danger ? undefined : ''} onClick={() => onDone(true)}>
            {options.confirmLabel ?? '确定'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** 提供 prompt / confirm / toast：替代浏览器自带的 window.prompt / confirm / alert，风格统一且可异步校验 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const nextDialogId = useRef(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastsRef = useRef<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextToastId = useRef(0);

  const show = useCallback((next: Pending) => {
    cancelPending(pendingRef.current); // 同一时刻只留一个对话框，被顶掉的按取消处理
    pendingRef.current = next;
    setPending(next);
  }, []);

  /** 只有「当前显示的就是它」时才结算并关闭：被顶掉的旧对话框迟到的回调不能把新对话框关掉 */
  const settle = useCallback(<T,>(target: Pending, resolve: (value: T) => void, value: T) => {
    if (pendingRef.current !== target) return;
    resolve(value);
    pendingRef.current = null;
    setPending(null);
  }, []);

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => show({ id: ++nextDialogId.current, kind: 'prompt', options, resolve })),
    [show],
  );
  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => show({ id: ++nextDialogId.current, kind: 'confirm', options, resolve })),
    [show],
  );

  const dismissToast = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    toastsRef.current = toastsRef.current.filter((t) => t.id !== id);
    setToasts(toastsRef.current);
  }, []);

  const scheduleDismiss = useCallback(
    (item: ToastItem) => {
      clearTimeout(timers.current.get(item.id));
      const ms = item.action ? ACTION_TOAST_MS : item.kind === 'error' ? ERROR_TOAST_MS : TOAST_MS;
      timers.current.set(item.id, setTimeout(() => dismissToast(item.id), ms));
    },
    [dismissToast],
  );

  const toast = useCallback(
    ({ kind = 'info', message, action }: ToastOptions) => {
      const item: ToastItem = { id: ++nextToastId.current, kind, message, action };
      toastsRef.current = [...toastsRef.current.slice(-(MAX_TOASTS - 1)), item];
      setToasts(toastsRef.current);
      scheduleDismiss(item);
    },
    [scheduleDismiss],
  );

  /** 鼠标停在提示上或键盘聚焦到提示里时暂停全部倒计时，移开后重新计时（WCAG 2.2.1：给足阅读与操作时间） */
  const holdToasts = useCallback(() => {
    for (const handle of timers.current.values()) clearTimeout(handle);
    timers.current.clear();
  }, []);
  const releaseToasts = useCallback(() => {
    for (const item of toastsRef.current) scheduleDismiss(item);
  }, [scheduleDismiss]);

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const handle of activeTimers.values()) clearTimeout(handle);
      activeTimers.clear();
      cancelPending(pendingRef.current);
    };
  }, []);

  const value = useMemo<Dialogs>(() => ({ prompt, confirm, toast }), [prompt, confirm, toast]);

  return (
    <DialogsContext.Provider value={value}>
      {children}
      {pending?.kind === 'prompt' && (
        <PromptDialog key={pending.id} options={pending.options} onDone={(result) => settle(pending, pending.resolve, result)} />
      )}
      {pending?.kind === 'confirm' && (
        <ConfirmDialog key={pending.id} options={pending.options} onDone={(result) => settle(pending, pending.resolve, result)} />
      )}
      <Toaster toasts={toasts} onDismiss={dismissToast} onHold={holdToasts} onRelease={releaseToasts} />
    </DialogsContext.Provider>
  );
}
