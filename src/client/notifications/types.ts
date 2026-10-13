import type { NoteChange } from '../../shared/types';

export type NotificationBody =
  | { type: 'changes'; changes: NoteChange[] }
  | { type: 'error'; reason: string }
  | { type: 'recovered' };

export type AppNotification = {
  /** 确定性 id：`${type}:${projectId}:${at}`。多个标签页各自收到同一事件时据此去重 */
  id: string;
  projectId: string;
  /** 产生时的快照：项目改名或被移除后，旧通知照常显示 */
  projectName: string;
  projectOrder: number;
  at: number;
  read: boolean;
  body: NotificationBody;
};
