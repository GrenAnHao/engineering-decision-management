import { statSync, watch, type FSWatcher } from 'node:fs';

export type WatchHandle = { close: () => void };

export type WatchOptions = {
  debounceMs: number;
  /** 事件持续不断时，自首个未处理事件起最多等待多久必须触发一次，默认 1000 */
  maxWaitMs?: number;
  onChange: () => void;
  onError: (err: Error) => void;
};

function inodeOf(dir: string): number | bigint | null {
  try {
    return statSync(dir).ino;
  } catch {
    return null;
  }
}

/**
 * 递归监听目录，debounce 合并连续事件后回调一次 onChange。
 * 目录不存在等建立失败的情况同步抛错，由调用方降级为手动刷新。
 */
export function watchNotes(dir: string, opts: WatchOptions): WatchHandle {
  const rootIno = inodeOf(dir);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let firstPendingAt = 0;
  let watcher: FSWatcher;
  const fire = () => {
    timer = null;
    if (closed) return;
    if (inodeOf(dir) !== rootIno) {
      closed = true;
      watcher.close();
      opts.onError(new Error('监听的目录已被删除或替换'));
      return;
    }
    try {
      opts.onChange();
    } catch (err) {
      opts.onError(err as Error);
    }
  };
  watcher = watch(dir, { recursive: true }, () => {
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
