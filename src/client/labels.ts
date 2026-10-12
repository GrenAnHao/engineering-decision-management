import type { Lifecycle } from '../shared/types';

export const STATUS_LABELS: Record<Lifecycle, string> = {
  implemented: '已落地',
  proposed: '待评审',
  rejected: '已否决',
  archived: '已归档',
};

const CLASS_LABELS: Record<string, string> = {
  architecture: '架构设计',
  feature: '功能特性',
  'bug-fix': '缺陷修复',
  simplification: '化简裁撤',
  process: '流程规范',
  testing: '测试基建',
};

export function classLabel(cls: string): string {
  return CLASS_LABELS[cls] ?? cls;
}

/** 左栏状态占比条：落地绿 / 待评审黄 / 否决红 / 归档灰 */
export const LIFECYCLE_COLORS: Record<Lifecycle, string> = {
  implemented: '#059669',
  proposed: '#D97706',
  rejected: '#DC2626',
  archived: '#94A3B8',
};

const PALETTE = ['#7C3AED', '#1D4ED8', '#0D9488', '#D97706', '#DC2626', '#0891B2'];

export function projectColor(order: number): string {
  return PALETTE[order % PALETTE.length]!;
}
