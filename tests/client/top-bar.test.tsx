import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TopBar, type TopBarProps } from '../../src/client/components/TopBar';
import type { FullscreenControl } from '../../src/client/state/useFullscreen';

const noop = () => {};
const fullscreen = (over: Partial<FullscreenControl> = {}): FullscreenControl => ({ supported: true, active: false, toggle: noop, ...over });

function render(over: Partial<TopBarProps> = {}): string {
  return renderToStaticMarkup(
    <TopBar
      project={null}
      view="baseline"
      status="live"
      theme="system"
      railOpen={false}
      onViewChange={noop}
      onRescan={noop}
      onOpenPalette={noop}
      onToggleRail={noop}
      onThemeChange={noop}
      fullscreen={fullscreen()}
      unread={0}
      notificationsOpen={false}
      onOpenNotifications={noop}
      {...over}
    />,
  );
}

test('顶栏右侧顺序：主题分段 → 全屏 → 铃铛', () => {
  const html = render();
  const theme = html.indexOf('aria-label="主题"');
  const full = html.indexOf('aria-label="全屏"');
  const bell = html.indexOf('aria-label="通知');
  expect(theme).toBeGreaterThan(-1);
  expect(full).toBeGreaterThan(theme);
  expect(bell).toBeGreaterThan(full);
});

test('全屏按钮：未全屏时 aria-pressed=false，全屏时为 true 且标题变为「退出全屏」', () => {
  expect(render()).toMatch(/aria-pressed="false"[^>]*aria-label="全屏"|aria-label="全屏"[^>]*aria-pressed="false"/);
  const html = render({ fullscreen: fullscreen({ active: true }) });
  expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="全屏"|aria-label="全屏"[^>]*aria-pressed="true"/);
  expect(html).toContain('title="退出全屏"');
});

test('不支持全屏时不渲染全屏按钮', () => {
  expect(render({ fullscreen: fullscreen({ supported: false }) })).not.toContain('aria-label="全屏"');
});

test('铃铛的可访问名称带未读数', () => {
  expect(render({ unread: 3 })).toMatch(/aria-label="通知，3 条未读"/);
});
