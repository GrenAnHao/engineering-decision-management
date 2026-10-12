const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
