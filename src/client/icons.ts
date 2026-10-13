// 界面图标统一出口（lucide），不使用 emoji：各平台 emoji 字形与对齐不一致。
import { ClipboardList, History, Landmark, ShieldAlert, type LucideIcon } from 'lucide-react';
import type { ViewId } from './router';

export const VIEW_ICONS: Record<ViewId, LucideIcon> = {
  baseline: Landmark,
  timeline: History,
  alternatives: ShieldAlert,
  directory: ClipboardList,
};
