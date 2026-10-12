import { watch } from 'node:fs';

export type WatchHandle = { close: () => void };

export type WatchOptions = {
  debounceMs: number;
  /** 事件持续不断时，自首个未处理事件起最多等待多久必须触发一次，默认 1000 */
  maxWaitMs?: number;
  onChange: () => void;
  onError: (err: Error) => void;
};

/**
 * 递归监听目录，debounce 合并连续事件后回调一次 onChange。
 * 目录不存在等建立失败的情况同步抛错，由调用方降级为手动刷新。
 */
export function watchNotes(dir: string, opts: WatchOptions): WatchHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let firstPendingAt = 0;
  const fire = () => {
    timer = null;
    if (closed) return;
    try {
      opts.onChange();
    } catch (err) {
      opts.onError(err as Error);
    }
  };
  const watcher = watch(dir, { recursive: true }, () => {
    if (closed) return;
    const now = Date.now();
    if (!timer) firstPendingAt = now;
    else clearTimeout(timer);
    const maxWait = opts.maxWaitMs ?? 1000;
    timer = setTimeout(fire, Math.max(0, Math.min(opts.debounceMs, firstPendingAt + maxWait - now)));
  });
  watcher.on('error', (err: Error) => {
    if (!closed) opts.onError(err);
  });
  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      watcher.close();
    },
  };
}
