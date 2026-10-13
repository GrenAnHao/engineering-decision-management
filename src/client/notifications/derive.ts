import type { NoteChange, ProjectErrorEvent, ProjectMeta, ProjectUpdatedEvent } from '../../shared/types';
import { dayGroup, type DayGroup } from '../format';
import { STATUS_LABELS } from '../labels';
import type { AppNotification, NotificationBody } from './types';

export type HubNotifyEvent =
  | { name: 'project-updated'; data: ProjectUpdatedEvent }
  | { name: 'project-error'; data: ProjectErrorEvent };

export type DeriveResult = {
  notifications: AppNotification[];
  /** 每个项目最近一次已通知的异常原因；恢复时清掉。返回新 Map，不改入参 */
  lastErrors: ReadonlyMap<string, string>;
};

type ChangeKind = NoteChange['kind'];
const KIND_ORDER: readonly ChangeKind[] = ['moved', 'added', 'modified', 'removed'];

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = { moved: '迁移', added: '新增', modified: '修改', removed: '删除' };

function make(project: ProjectMeta, at: number, body: NotificationBody): AppNotification {
  return {
    id: `${body.type}:${project.id}:${at}`,
    projectId: project.id,
    projectName: project.displayName,
    projectOrder: project.order,
    at,
    read: false,
    body,
  };
}

const isLive = (p: ProjectMeta) => p.healthy && p.watchMode === 'live';

/**
 * SSE 事件 → 通知。prevMeta 是收到事件前前端已知的该项目元数据。
 * 隐藏项目不通知；同一项目恢复前重复出现相同原因的异常只通知一次。
 */
export function toNotifications(
  event: HubNotifyEvent,
  prevMeta: ProjectMeta | undefined,
  lastErrors: ReadonlyMap<string, string>,
): DeriveResult {
  if (event.name === 'project-error') {
    const { id, reason, at } = event.data;
    // prevMeta.error 是服务端记下的同一原因：刷新页面或新开标签页后内存里的 lastErrors 为空，靠它去重
    if (!prevMeta || prevMeta.hidden || prevMeta.error === reason || lastErrors.get(id) === reason) {
      return { notifications: [], lastErrors };
    }
    return { notifications: [make(prevMeta, at, { type: 'error', reason })], lastErrors: new Map(lastErrors).set(id, reason) };
  }

  const { project, changes, at } = event.data;
  const recovered = !!prevMeta && !isLive(prevMeta) && isLive(project);
  // 恢复后清掉异常记录，隐藏项目也不例外：取消隐藏后同一原因的异常不能被当成重复
  let errors = lastErrors;
  if (recovered) {
    const next = new Map(lastErrors);
    next.delete(project.id);
    errors = next;
  }
  if (project.hidden) return { notifications: [], lastErrors: errors };
  const notifications: AppNotification[] = [];
  if (recovered) notifications.push(make(project, at, { type: 'recovered' }));
  if (changes && changes.length > 0) notifications.push(make(project, at, { type: 'changes', changes }));
  return { notifications, lastErrors: errors };
}

export function changeLabel(change: NoteChange): string {
  return change.kind === 'moved' ? `${STATUS_LABELS[change.from]} → ${STATUS_LABELS[change.to]}` : CHANGE_KIND_LABELS[change.kind];
}

function countByKind(changes: readonly NoteChange[]): [ChangeKind, number][] {
  return KIND_ORDER.map((kind): [ChangeKind, number] => [kind, changes.filter((c) => c.kind === kind).length]).filter(([, n]) => n > 0);
}

/** 「迁移 1、新增 1、修改 2」 */
export function summarize(changes: readonly NoteChange[]): string {
  return countByKind(changes)
    .map(([kind, n]) => `${CHANGE_KIND_LABELS[kind]} ${n}`)
    .join('、');
}

/** 卡片只列前 limit 处时末尾的「另有 1 处修改、1 处删除」；没有剩余返回 null */
export function remainderText(changes: readonly NoteChange[], limit: number): string | null {
  const rest = changes.slice(limit);
  if (rest.length === 0) return null;
  return `另有 ${countByKind(rest)
    .map(([kind, n]) => `${n} 处${CHANGE_KIND_LABELS[kind]}`)
    .join('、')}`;
}

/** 一句话描述：系统通知正文，也是 notificationLabel 的后半句 */
export function notificationText(n: AppNotification): string {
  switch (n.body.type) {
    case 'changes':
      return `${summarize(n.body.changes)}：${n.body.changes[0]?.title ?? ''}`;
    case 'error':
      return n.body.reason;
    case 'recovered':
      return '实时监听已恢复';
  }
}

/** 卡片的可访问名称、读屏摘要：「项目名：一句话描述」 */
export function notificationLabel(n: AppNotification): string {
  return `${n.projectName}：${notificationText(n)}`;
}

/** 按 今天 / 昨天 / 更早 分组，保持传入顺序（新的在前），跳过空组 */
export function groupByDay(items: readonly AppNotification[], now: number): [DayGroup, AppNotification[]][] {
  const groups = new Map<DayGroup, AppNotification[]>();
  for (const n of items) {
    const label = dayGroup(n.at, now);
    const list = groups.get(label);
    if (list) list.push(n);
    else groups.set(label, [n]);
  }
  return (['今天', '昨天', '更早'] as const).flatMap((label): [DayGroup, AppNotification[]][] => {
    const list = groups.get(label);
    return list ? [[label, list]] : [];
  });
}
