import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NoteChange } from '../../src/shared/types';
import { NotificationBell, unreadBadge } from '../../src/client/components/NotificationBell';
import { NotificationCard } from '../../src/client/components/NotificationCard';
import type { AppNotification } from '../../src/client/notifications/types';

const noop = () => {};
const change = (kind: 'added' | 'modified' | 'removed', title: string): NoteChange => ({
  kind,
  id: `implemented/a/${title}.md`,
  title,
  lifecycle: 'implemented',
});
const moved: NoteChange = { kind: 'moved', id: 'implemented/a/m.md', fromId: 'proposed/a/m.md', title: 'M', from: 'proposed', to: 'implemented' };

function notification(body: AppNotification['body'], over: Partial<AppNotification> = {}): AppNotification {
  return { id: 'n1', projectId: 'P', projectName: '工程决策中心', projectOrder: 1, at: Date.now(), read: false, body, ...over };
}

const render = (n: AppNotification, variant: 'toast' | 'drawer') =>
  renderToStaticMarkup(
    <NotificationCard notification={n} variant={variant} onOpenProject={noop} onOpenNote={noop} onDismiss={noop} />,
  );

const buttons = (html: string) => html.match(/<button/g)?.length ?? 0;

test('已删除的笔记划线显示、不渲染成按钮；其余行可点', () => {
  const html = render(notification({ type: 'changes', changes: [change('added', 'A'), change('removed', 'B')] }), 'drawer');
  expect(html).toContain('line-through');
  expect(html).toContain('>B<');
  // 项目名 + 清除 + 「A」这一行
  expect(buttons(html)).toBe(3);
});

test('迁移行的标签写成「待评审 → 已落地」', () => {
  expect(render(notification({ type: 'changes', changes: [moved] }), 'drawer')).toContain('待评审 → 已落地');
});

test('toast：超过 3 处时只列前 3 处并汇总剩余，带倒计时条', () => {
  const changes = [moved, change('added', 'A'), change('added', 'C'), change('modified', 'Y'), change('removed', 'Z')];
  const html = render(notification({ type: 'changes', changes }), 'toast');
  expect(html).toContain('另有 1 处修改、1 处删除');
  expect(html).not.toContain('>Y<');
  expect(html).toContain('animate-toast-timer');
  expect(html).toContain('aria-label="收起"');
  expect(html).toContain('5 处变更 · 刚刚');
});

test('drawer：超过 3 处时有「展开全部」，未读带「新」，清除按钮', () => {
  const changes = [moved, change('added', 'A'), change('added', 'C'), change('modified', 'Y')];
  const html = render(notification({ type: 'changes', changes }), 'drawer');
  expect(html).toContain('展开全部 4 处');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('>新<');
  expect(html).toContain('aria-label="清除通知"');
  expect(render(notification({ type: 'changes', changes }, { read: true }), 'drawer')).not.toContain('>新<');
});

test('异常与已恢复', () => {
  expect(render(notification({ type: 'error', reason: '路径失效：ENOENT' }), 'drawer')).toContain('路径失效：ENOENT');
  const recovered = render(notification({ type: 'recovered' }), 'drawer');
  expect(recovered).toContain('已恢复');
  expect(recovered).toContain('实时监听已恢复');
});

test('卡片带项目色变量与可访问名称', () => {
  const html = render(notification({ type: 'changes', changes: [change('added', 'A')] }), 'drawer');
  expect(html).toContain('--project:#1D4ED8'); // projectColor(1)
  expect(html).toContain('aria-label="工程决策中心：新增 1：A"');
});

test('未读角标：0 不显示，超过 99 显示 99+', () => {
  expect(unreadBadge(0)).toBeNull();
  expect(unreadBadge(7)).toBe('7');
  expect(unreadBadge(100)).toBe('99+');
  expect(renderToStaticMarkup(<NotificationBell unread={0} open={false} onClick={noop} />)).toContain('aria-label="通知"');
  const html = renderToStaticMarkup(<NotificationBell unread={120} open onClick={noop} />);
  expect(html).toContain('aria-label="通知，120 条未读"');
  expect(html).toContain('>99+<');
  expect(html).toContain('aria-expanded="true"');
});
