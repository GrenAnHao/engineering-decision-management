const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 左栏新鲜度：刚刚 / 12m 前 / 3h 前 / 昨天 / 5 天前 / 日期 */
export function relativeTime(ms: number, now = Date.now()): string {
  if (!ms) return '—';
  const diff = Math.max(0, now - ms);
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m 前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h 前`;
  if (diff < 2 * DAY) return '昨天';
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 通知时间：今天「14:32」，今年其他日子「10月11日 14:32」，跨年「2025年1月3日 14:32」 */
export function clockTime(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (startOfDay(ms) === startOfDay(now)) return hm;
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : `${d.getFullYear()}年`;
  return `${year}${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

export type DayGroup = '今天' | '昨天' | '更早';

/** 按自然日分组；「昨天」取今天零点前一毫秒所在日，夏令时切换日也正确 */
export function dayGroup(ms: number, now = Date.now()): DayGroup {
  const today = startOfDay(now);
  if (ms >= today) return '今天';
  return ms >= startOfDay(today - 1) ? '昨天' : '更早';
}

/** Markdown → 单行纯文本，用于卡片摘要与检索 */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/[*`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
