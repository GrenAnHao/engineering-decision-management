import { expect, test } from 'bun:test';
import { notificationTarget } from '../../src/client/notifications/target';
import type { AppNotification } from '../../src/client/notifications/types';

const n: AppNotification = {
  id: 'changes:P:1',
  projectId: 'P',
  projectName: '项目 P',
  projectOrder: 0,
  at: 1,
  read: false,
  body: { type: 'recovered' },
};

test('项目已不在清单里：提示已移除（用快照里的项目名），不跳转', () => {
  expect(notificationTarget(n, 'implemented/a/x.md', ['Q'], 'timeline')).toEqual({ kind: 'removed', message: '项目「项目 P」已移除' });
});

test('点项目名：切到该项目，保持当前视图，不打开笔记', () => {
  expect(notificationTarget(n, null, ['Q', 'P'], 'timeline')).toEqual({ kind: 'go', route: { projectId: 'P', view: 'timeline', note: null } });
});

test('点变更行：保持当前视图并打开该笔记', () => {
  expect(notificationTarget(n, 'implemented/a/x.md', ['P'], 'directory')).toEqual({
    kind: 'go',
    route: { projectId: 'P', view: 'directory', note: 'implemented/a/x.md' },
  });
});
