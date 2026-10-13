import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useDialogs } from '../ui/dialogs';

export type FullscreenControl = { supported: boolean; active: boolean; toggle: () => void };

function subscribe(listener: () => void): () => void {
  document.addEventListener('fullscreenchange', listener);
  return () => document.removeEventListener('fullscreenchange', listener);
}

/** 页面加载后不会变；SSR / 测试环境没有 document 时视为不支持 */
const SUPPORTED = typeof document !== 'undefined' && document.fullscreenEnabled === true;

// 用 != null：不支持 Fullscreen API 的浏览器里 fullscreenElement 是 undefined，不能当成「已全屏」
const isActive = () => document.fullscreenElement != null;

/**
 * 浏览器全屏（Fullscreen API，作用于整页）。按 F11 进入的是浏览器自己的全屏，网页检测不到，
 * 这时 active 仍为 false，属已知限制。
 */
export function useFullscreen(): FullscreenControl {
  const { toast } = useDialogs();
  const active = useSyncExternalStore(subscribe, isActive, () => false);
  const toggle = useCallback(() => {
    if (!SUPPORTED) return;
    const action = isActive() ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    action.catch((err: unknown) => toast({ kind: 'error', message: `无法切换全屏：${err instanceof Error ? err.message : String(err)}` }));
  }, [toast]);
  // 返回稳定对象：App 把它放进命令列表 useMemo 的依赖里，每次渲染都换新对象会让 memo 失效
  return useMemo(() => ({ supported: SUPPORTED, active, toggle }), [active, toggle]);
}
