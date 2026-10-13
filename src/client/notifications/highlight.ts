import type { AppNotification } from './types';

/**
 * 通知抽屉里的「新」：打开抽屉会立刻 markAllRead，卡片再看 read 就永远是已读，
 * 所以在标已读之前先拍下未读的 id，本次打开期间按这份快照显示「新」。
 */
export function snapshotUnread(items: readonly AppNotification[]): Set<string> {
  return new Set(items.filter((n) => !n.read).map((n) => n.id));
}

/** 把 ids 并进已有的高亮集合；没有新增时原样返回同一个集合，setState 不触发重渲染 */
export function addHighlights(highlighted: ReadonlySet<string>, ids: Iterable<string>): ReadonlySet<string> {
  let next: Set<string> | null = null;
  for (const id of ids) {
    if (highlighted.has(id) || next?.has(id)) continue;
    next ??= new Set(highlighted);
    next.add(id);
  }
  return next ?? highlighted;
}
