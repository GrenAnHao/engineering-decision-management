import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'edm-theme';
/** 顶栏分段与命令面板的排列顺序 */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const listeners = new Set<() => void>();
const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

/** localStorage 不可用（隐私模式、被禁用）时，偏好只存在内存里，本次会话内仍然生效 */
let memoryPreference: ThemePreference | null = null;

function readStored(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function readPreference(): ThemePreference {
  return memoryPreference ?? readStored();
}

export function writePreference(next: ThemePreference): void {
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
    memoryPreference = null;
  } catch {
    memoryPreference = next;
  }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

function applyTheme(): void {
  const root = document.documentElement;
  const next = resolveTheme(readPreference(), darkQuery?.matches ?? false);
  if (root.dataset.theme === next) return;
  // 切换瞬间关掉全部过渡：否则带 transition 的元素渐变、其余元素瞬变，整页会参差不齐
  root.classList.add('theme-switching');
  root.dataset.theme = next;
  void getComputedStyle(root).opacity; // 强制样式重算，让「无过渡」先生效
  requestAnimationFrame(() => root.classList.remove('theme-switching'));
}

function emit(): void {
  applyTheme();
  for (const listener of listeners) listener();
}

if (typeof document !== 'undefined') {
  applyTheme(); // index.html 的内联脚本在异常时可能没设上，这里兜底
  // 偏好为「跟随系统」时，系统主题变化要立刻生效
  darkQuery?.addEventListener('change', emit);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', emit); // 多个标签页之间同步
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', emit);
  };
}

export function setPreference(next: ThemePreference): void {
  writePreference(next);
  emit();
}

export function useTheme(): {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
} {
  const preference = useSyncExternalStore(subscribe, readPreference, () => 'system' as const);
  return { preference, setPreference };
}
