import { Maximize, Menu, Minimize, RefreshCw, Search } from 'lucide-react';
import type { ProjectMeta } from '../../shared/types';
import { THEME_ICONS, VIEW_ICONS } from '../icons';
import { THEME_LABELS } from '../labels';
import { VIEW_LABELS, VIEWS, type ViewId } from '../router';
import type { FullscreenControl } from '../state/useFullscreen';
import type { SyncStatus } from '../state/useHub';
import { THEME_PREFERENCES, type ThemePreference } from '../theme';
import { Button } from '../ui/Button';
import { Kbd, MOD_KEY_LABEL } from '../ui/Kbd';
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl';
import { cn } from '../ui/tw';
import { NotificationBell } from './NotificationBell';

export type TopBarProps = {
  project: ProjectMeta | null;
  view: ViewId;
  status: SyncStatus;
  theme: ThemePreference;
  /** 窄屏下左栏抽屉是否展开，用于菜单按钮的 aria-expanded */
  railOpen: boolean;
  onViewChange: (view: ViewId) => void;
  onRescan: (projectId: string) => void;
  onOpenPalette: () => void;
  onToggleRail: () => void;
  onThemeChange: (theme: ThemePreference) => void;
  fullscreen: FullscreenControl;
  /** 未读通知数，用于铃铛角标 */
  unread: number;
  notificationsOpen: boolean;
  onOpenNotifications: () => void;
};

const VIEW_OPTIONS: readonly SegmentOption<ViewId>[] = VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v], icon: VIEW_ICONS[v] }));
const THEME_OPTIONS: readonly SegmentOption<ThemePreference>[] = THEME_PREFERENCES.map((p) => ({
  value: p,
  label: THEME_LABELS[p],
  icon: THEME_ICONS[p],
}));

/** 同步状态：一切正常时不显示，只在连接异常、降级或需要手动操作时出现 */
function SyncBeacon({ project, status, onRescan }: Pick<TopBarProps, 'project' | 'status' | 'onRescan'>) {
  const pill = 'inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium whitespace-nowrap ring-1 ring-inset max-md:px-2.5';
  const dot = <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-amber-500" />;
  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <div role="status" className={cn(pill, 'bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300')}>
        {dot}
        <span className="max-md:sr-only">{status === 'connecting' ? '连接中…' : '连接断开，重连中…'}</span>
      </div>
    );
  }
  if (project && project.watchMode === 'manual') {
    return (
      <button
        type="button"
        title="该项目无法实时监听，点击手动刷新"
        onClick={() => onRescan(project.id)}
        className={cn(pill, 'bg-surface-2 text-fg-muted ring-line-strong transition-colors hover:bg-surface-3 hover:text-fg')}
      >
        <RefreshCw aria-hidden="true" className="size-3.5" />
        <span className="max-md:sr-only">手动刷新模式</span>
      </button>
    );
  }
  if (status === 'polling') {
    return (
      <div role="status" className={cn(pill, 'bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300')}>
        {dot}
        <span className="max-md:sr-only">轮询同步（30 s）</span>
      </div>
    );
  }
  return null;
}

export function TopBar(props: TopBarProps) {
  const { project, view, theme, railOpen, onViewChange, onOpenPalette, onToggleRail, onThemeChange, fullscreen, unread, notificationsOpen, onOpenNotifications } =
    props;
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-surface/80 px-3 backdrop-blur-xl sm:gap-3 sm:px-4 lg:px-6">
      <Button
        id="rail-toggle"
        variant="ghost"
        size="icon"
        className="-ml-1 lg:hidden"
        aria-label="项目栏"
        aria-expanded={railOpen}
        aria-controls="project-rail"
        onClick={onToggleRail}
      >
        <Menu aria-hidden="true" />
      </Button>

      <div className="flex min-w-0 shrink-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-linear-to-br from-slate-700 to-slate-950 shadow-card ring-1 ring-black/10 dark:ring-white/15"
        >
          <span className="size-2 rounded-full bg-blue-400 shadow-[0_0_10px_rgb(96_165_250/0.9)]" />
        </span>
        <span className="font-display text-[15px] font-bold tracking-tight whitespace-nowrap max-sm:sr-only">工程决策中心</span>
        {project && (
          <>
            <span aria-hidden="true" className="hidden text-fg-subtle/60 xl:inline">
              /
            </span>
            <span className="hidden max-w-[16rem] items-baseline gap-1.5 truncate text-[13px] font-medium text-fg-muted xl:flex">
              <span className="truncate">{project.displayName}</span>
              <span className="tabular text-xs text-fg-subtle">{project.count} 条</span>
            </span>
          </>
        )}
      </div>

      <SegmentedControl mode="nav" label="视图" value={view} options={VIEW_OPTIONS} onChange={onViewChange} iconOnly="below-lg" />

      <div className="flex-1" />

      <button
        type="button"
        onClick={onOpenPalette}
        className="flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-surface text-sm text-fg-subtle shadow-card ring-1 ring-line-strong transition-colors ring-inset hover:bg-surface-2 hover:text-fg-muted md:w-56 md:justify-start md:px-3 lg:w-64"
      >
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="hidden flex-1 text-left md:inline">搜索决策、跳转…</span>
        <span className="sr-only md:hidden">搜索</span>
        <Kbd className="hidden md:inline-flex">{MOD_KEY_LABEL} K</Kbd>
      </button>

      <SegmentedControl mode="radio" label="主题" value={theme} options={THEME_OPTIONS} onChange={onThemeChange} iconOnly className="max-sm:hidden" />

      {fullscreen.supported && (
        <Button
          variant="ghost"
          size="icon"
          className="max-sm:hidden"
          title={fullscreen.active ? '退出全屏' : '全屏'}
          aria-label="全屏"
          aria-pressed={fullscreen.active}
          onClick={fullscreen.toggle}
        >
          {fullscreen.active ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        </Button>
      )}

      <NotificationBell unread={unread} open={notificationsOpen} onClick={onOpenNotifications} />

      <SyncBeacon project={props.project} status={props.status} onRescan={props.onRescan} />
    </header>
  );
}
