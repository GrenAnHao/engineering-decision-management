// 界面图标统一出口（lucide），不使用 emoji：各平台 emoji 字形与对齐不一致。
import { ClipboardList, History, Landmark, Monitor, Moon, ShieldAlert, Sun, type LucideIcon } from 'lucide-react';
import type { ViewId } from './router';
import type { ThemePreference } from './theme';

export const VIEW_ICONS: Record<ViewId, LucideIcon> = {
  baseline: Landmark,
  timeline: History,
  alternatives: ShieldAlert,
  directory: ClipboardList,
};

export const THEME_ICONS: Record<ThemePreference, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};
