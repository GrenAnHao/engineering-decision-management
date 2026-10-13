import type { Route, ViewId } from '../router';
import type { AppNotification } from './types';

export type NotificationTarget = { kind: 'removed'; message: string } | { kind: 'go'; route: Route };

/** 点通知去哪：项目已不在清单里时给出提示；否则切到该项目、保持当前视图，带笔记 id 时直接打开该笔记 */
export function notificationTarget(n: AppNotification, noteId: string | null, projectIds: readonly string[], view: ViewId): NotificationTarget {
  if (!projectIds.includes(n.projectId)) return { kind: 'removed', message: `项目「${n.projectName}」已移除` };
  return { kind: 'go', route: { projectId: n.projectId, view, note: noteId } };
}
