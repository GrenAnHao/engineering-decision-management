import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NoteChange } from '../../src/shared/types';
import { NotificationBell, unreadBadge } from '../../src/client/components/NotificationBell';
import { NotificationCard } from '../../src/client/components/NotificationCard';
import { NotificationDrawer } from '../../src/client/components/NotificationDrawer';
import { NotificationStack } from '../../src/client/components/NotificationStack';
import { projectColor } from '../../src/client/labels';
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

const render = (n: AppNotification, variant: 'toast' | 'drawer', highlighted = false) =>
  renderToStaticMarkup(
    <NotificationCard notification={n} variant={variant} highlighted={highlighted} onOpenProject={noop} onOpenNote={noop} onDismiss={noop} />,
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
  expect(html).toContain('aria-label="收起：工程决策中心"');
  expect(html).toContain('5 处变更 · 刚刚');
});

test('drawer：超过 3 处时有「展开全部」，高亮时带「新」，清除按钮', () => {
  const changes = [moved, change('added', 'A'), change('added', 'C'), change('modified', 'Y')];
  const html = render(notification({ type: 'changes', changes }), 'drawer', true);
  expect(html).toContain('展开全部 4 处');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('>新<');
  // 展开按钮指向变更行列表的容器
  const controls = /aria-controls="([^"]+)"/.exec(html)?.[1];
  expect(controls).toBeTruthy();
  expect(html).toContain(`id="${controls}"`);
  expect(html).toContain('aria-label="清除通知：工程决策中心"');
});

test('drawer：「新」只看 highlighted，不看 read', () => {
  const body = { type: 'recovered' } as const;
  expect(render(notification(body, { read: true }), 'drawer', true)).toContain('>新<');
  expect(render(notification(body, { read: false }), 'drawer', true)).toContain('>新<');
  expect(render(notification(body, { read: false }), 'drawer', false)).not.toContain('>新<');
  expect(render(notification(body, { read: true }), 'drawer', false)).not.toContain('>新<');
  // toast 变体不显示「新」
  expect(render(notification(body), 'toast', true)).not.toContain('>新<');
});

test('异常与已恢复', () => {
  expect(render(notification({ type: 'error', reason: '路径失效：ENOENT' }), 'drawer')).toContain('路径失效：ENOENT');
  const recovered = render(notification({ type: 'recovered' }), 'drawer');
  expect(recovered).toContain('已恢复');
  expect(recovered).toContain('实时监听已恢复');
});

test('卡片带项目色变量与可访问名称', () => {
  const html = render(notification({ type: 'changes', changes: [change('added', 'A')] }), 'drawer');
  expect(html).toContain(`--project:${projectColor(1)}`);
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

test('通知抽屉：模态对话框、标题、条数；为空时禁用全部清除并显示空态', () => {
  const props = { onClose: noop, onClearAll: noop, onDismiss: noop, onOpenProject: noop, onOpenNote: noop };
  const empty = renderToStaticMarkup(<NotificationDrawer items={[]} highlighted={new Set()} {...props} />);
  expect(empty).toContain('role="dialog"');
  expect(empty).toContain('aria-labelledby="notification-drawer-title"');
  expect(empty).toContain('暂无通知');
  expect(empty).toMatch(/<button[^>]*disabled[^>]*>全部清除/);

  const items = [notification({ type: 'recovered' }, { id: 'a' }), notification({ type: 'recovered' }, { id: 'b', at: 0 })];
  const html = renderToStaticMarkup(<NotificationDrawer items={items} highlighted={new Set()} {...props} />);
  expect(html).toContain('2 条');
  expect(html).toContain('今天');
  expect(html).toContain('更早');
});

test('通知抽屉：只有 highlighted 集合里的卡片显示「新」，与 read 无关', () => {
  const props = { onClose: noop, onClearAll: noop, onDismiss: noop, onOpenProject: noop, onOpenNote: noop };
  const items = [
    notification({ type: 'recovered' }, { id: 'a', projectName: '甲', read: true }),
    notification({ type: 'recovered' }, { id: 'b', projectName: '乙', read: true }),
    notification({ type: 'recovered' }, { id: 'c', projectName: '丙', read: false }),
  ];
  const html = renderToStaticMarkup(<NotificationDrawer items={items} highlighted={new Set(['a', 'b'])} {...props} />);
  const cards = html.split('<article').slice(1);
  expect(cards).toHaveLength(3);
  expect(cards.map((card) => card.includes('>新<'))).toEqual([true, true, false]);
});

test('弹出栈：live 区域只放一句摘要，卡片在另一个不带 aria-live 的容器里；最多显示 3 张', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => notification({ type: 'changes', changes: [change('added', id)] }, { id }));
  const html = renderToStaticMarkup(<NotificationStack items={items} onDismiss={noop} onOpenProject={noop} onOpenNote={noop} />);
  const live = /<div[^>]*aria-live="polite"[^>]*>(.*?)<\/div>/.exec(html);
  expect(live?.[0]).toContain('sr-only');
  expect(live?.[1]).toContain('<p>工程决策中心：新增 1：a</p>');
  expect(live?.[1]).not.toContain('<article');
  expect(html.match(/aria-live=/g)?.length).toBe(1);
  expect(html.match(/<article/g)?.length).toBe(3);
  const empty = renderToStaticMarkup(<NotificationStack items={[]} onDismiss={noop} onOpenProject={noop} onOpenNote={noop} />);
  expect(empty).toContain('aria-live="polite"');
});
