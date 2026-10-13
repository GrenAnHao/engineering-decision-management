import { Menu, Monitor, Moon, RefreshCw, Search, Sun } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ProjectMeta } from '../../shared/types';
import { VIEW_ICONS } from '../icons';
import { VIEW_LABELS, VIEWS, type ViewId } from '../router';
import type { SyncStatus } from '../state/useHub';
import type { ThemePreference } from '../theme';
import { Button } from '../ui/Button';
import { Kbd, MOD_KEY_LABEL } from '../ui/Kbd';
import { cn } from '../ui/tw';

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
  onCycleTheme: () => void;
};

const THEME_META: Record<ThemePreference, { icon: typeof Sun; label: string }> = {
  system: { icon: Monitor, label: '跟随系统' },
  light: { icon: Sun, label: '浅色' },
  dark: { icon: Moon, label: '深色' },
};

/** 视图切换：一块滑动的底板跟随当前标签，宽度随标签文字变化 */
function ViewTabs({ view, onViewChange }: Pick<TopBarProps, 'view' | 'onViewChange'>) {
  const listRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[aria-current="page"]');
      if (active) setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [view]);

  return (
    <nav
      ref={listRef}
      aria-label="视图"
      className="relative flex shrink-0 rounded-[10px] bg-surface-2 p-0.5 ring-1 ring-line ring-inset"
    >
      {pill && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0.5 left-0 rounded-lg bg-surface shadow-raised ring-1 ring-line transition-[transform,width] duration-300 ease-out"
          style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
        />
      )}
      {VIEWS.map((v) => {
        const Icon = VIEW_ICONS[v];
        const active = v === view;
        return (
          <button
            key={v}
            type="button"
            aria-current={active ? 'page' : undefined}
            title={VIEW_LABELS[v]}
            onClick={() => onViewChange(v)}
            className={cn(
              'relative z-10 inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold whitespace-nowrap transition-colors',
              active ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            <Icon aria-hidden="true" className={cn('size-4 transition-colors', active && 'text-accent-text')} />
            <span className="max-lg:sr-only">{VIEW_LABELS[v]}</span>
          </button>
        );
      })}
    </nav>
  );
}

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
  const { project, view, theme, railOpen, onViewChange, onOpenPalette, onToggleRail, onCycleTheme } = props;
  const { icon: ThemeIcon, label: themeLabel } = THEME_META[theme];
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

      <ViewTabs view={view} onViewChange={onViewChange} />

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

      <Button
        variant="ghost"
        size="icon"
        className="max-sm:hidden"
        title={`主题：${themeLabel}（点击切换）`}
        aria-label={`主题：${themeLabel}，点击切换`}
        onClick={onCycleTheme}
      >
        <ThemeIcon aria-hidden="true" />
      </Button>

      <SyncBeacon project={props.project} status={props.status} onRescan={props.onRescan} />
    </header>
  );
}
