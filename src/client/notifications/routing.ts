export type IncomingRoute = 'desktop' | 'read' | 'toast';

/**
 * 新通知到达时怎么处理：
 * - 页面在后台 → 系统通知（抽屉开着也一样，且不标已读：人不在，回来要看到角标与「新」）；
 * - 页面可见且抽屉开着 → 直接出现在列表里，标为已读；
 * - 其余 → 弹卡片。
 */
export function routeIncoming({ drawerOpen, hidden }: { drawerOpen: boolean; hidden: boolean }): IncomingRoute {
  if (hidden) return 'desktop';
  return drawerOpen ? 'read' : 'toast';
}
