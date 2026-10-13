import type { Lifecycle, NoteChange } from '../shared/types';
import type { ThemePreference } from './theme';
import type { Tone } from './ui/Badge';

export const STATUS_LABELS: Record<Lifecycle, string> = {
  implemented: '已落地',
  proposed: '待评审',
  rejected: '已否决',
  archived: '已归档',
};

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};

/** 命令面板的搜索关键词；中文名已在 label 里，这里只补英文与别名，避免三条命令互相命中 */
export const THEME_KEYWORDS: Record<ThemePreference, string> = {
  system: 'theme 主题 system auto',
  light: 'theme 主题 light',
  dark: 'theme 主题 dark',
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

export const STATUS_TONES: Record<Lifecycle, Tone> = {
  implemented: 'emerald',
  proposed: 'amber',
  rejected: 'rose',
  archived: 'neutral',
};

const CLASS_TONES: Record<string, Tone> = {
  architecture: 'orange',
  feature: 'blue',
  'bug-fix': 'emerald',
  simplification: 'teal',
  process: 'purple',
  testing: 'pink',
};

/** 分类的徽标色系；未知分类用中性灰 */
export function classTone(cls: string): Tone {
  return CLASS_TONES[cls] ?? 'neutral';
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

/** 变更动作的文案 */
export const CHANGE_KIND_LABELS: Record<NoteChange['kind'], string> = { moved: '迁移', added: '新增', modified: '修改', removed: '删除' };

/** 变更动作的徽标色 */
export const CHANGE_TONES: Record<NoteChange['kind'], Tone> = { moved: 'purple', added: 'emerald', modified: 'blue', removed: 'rose' };
