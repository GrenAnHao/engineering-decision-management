import { expect, test } from 'bun:test';
import { routeIncoming } from '../../src/client/notifications/routing';

test('页面在后台：发系统通知，抽屉开着也不标已读', () => {
  expect(routeIncoming({ hidden: true, drawerOpen: false })).toBe('desktop');
  expect(routeIncoming({ hidden: true, drawerOpen: true })).toBe('desktop');
});

test('页面可见且抽屉开着：直接标已读', () => {
  expect(routeIncoming({ hidden: false, drawerOpen: true })).toBe('read');
});

test('页面可见、抽屉关着：弹卡片', () => {
  expect(routeIncoming({ hidden: false, drawerOpen: false })).toBe('toast');
});
