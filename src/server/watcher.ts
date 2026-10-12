import { watch } from 'node:fs';

export type WatchHandle = { close: () => void };

export type WatchOptions = {
  debounceMs: number;
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
  const watcher = watch(dir, { recursive: true }, () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!closed) opts.onChange();
    }, opts.debounceMs);
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
