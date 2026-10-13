import { ChevronRight, Eye, EyeOff, Pencil, Plus, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { LIFECYCLES, type ProjectMeta } from '../../shared/types';
import { relativeTime } from '../format';
import { LIFECYCLE_COLORS, projectColor } from '../labels';
import { cn } from '../ui/tw';

export type ProjectActions = {
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (project: ProjectMeta) => void;
  onToggleHidden: (project: ProjectMeta) => void;
  onRemove: (project: ProjectMeta) => void;
  onRescan: (project: ProjectMeta) => void;
};

/** 左栏排序：最近变动在前，同时间按发现顺序 */
export function sortProjects(projects: readonly ProjectMeta[]): ProjectMeta[] {
  return [...projects].sort((a, b) => b.lastChangeAt - a.lastChangeAt || a.order - b.order);
}

const ACTION_CLASS =
  'grid size-6 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-accent-text [&_svg]:size-3.5';

function RailTag({ children, danger }: { children: string; danger?: boolean }) {
  return (
    <span
      className={cn(
        'mt-1.5 ml-4 inline-flex items-center gap-1 rounded px-1.5 py-px text-2xs font-semibold ring-1 ring-inset',
        danger
          ? 'bg-rose-500/10 text-rose-700 ring-rose-600/20 dark:text-rose-300'
          : 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300',
      )}
    >
      {danger && <TriangleAlert aria-hidden="true" className="size-3" />}
      {children}
    </span>
  );
}

function RailItem({ project, active, actions }: { project: ProjectMeta; active: boolean; actions: ProjectActions }) {
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const live = project.healthy && project.watchMode === 'live';
  return (
    <div
      title={project.path}
      className={cn(
        'group relative rounded-lg transition-colors',
        active ? 'bg-accent-soft' : 'hover:bg-surface-2',
        !project.healthy && 'opacity-60',
      )}
    >
      {active && <span aria-hidden="true" className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-accent" />}
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        onClick={() => actions.onSelect(project.id)}
        className="block w-full rounded-lg px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-[3px]" style={{ background: projectColor(project.order) }} />
          <span className="truncate text-[13px] font-semibold text-fg">{project.displayName}</span>
          {live && (
            <span title="实时监听中" className="relative ml-auto flex size-1.5 shrink-0 group-focus-within:invisible group-hover:invisible">
              <span aria-hidden="true" className="absolute inset-0 animate-ping-slow rounded-full bg-emerald-500/60" />
              <span className="relative size-1.5 rounded-full bg-emerald-500" />
            </span>
          )}
        </span>
        <span className="tabular mt-1 block pl-4 text-[11px] text-fg-subtle">
          {project.count} 条 · {relativeTime(project.lastChangeAt)}
        </span>
        {project.count > 0 && (
          <span aria-hidden="true" className="mt-2 ml-4 flex h-[3px] gap-px overflow-hidden rounded-full">
            {LIFECYCLES.filter((l) => project.counts[l] > 0).map((l) => (
              <i key={l} className="block min-w-0.5 opacity-90" style={{ background: LIFECYCLE_COLORS[l], flexGrow: project.counts[l] }} />
            ))}
          </span>
        )}
        {!project.healthy && <RailTag danger>路径失效</RailTag>}
        {project.healthy && project.watchMode === 'manual' && <RailTag>手动刷新</RailTag>}
      </button>
      <div className="absolute top-1.5 right-1.5 hidden gap-px rounded-lg bg-surface p-0.5 shadow-raised ring-1 ring-line-strong group-focus-within:flex group-hover:flex pointer-coarse:flex">
        {project.watchMode === 'manual' && (
          <button type="button" className={ACTION_CLASS} title="重新扫描" aria-label="重新扫描" onClick={stop(() => actions.onRescan(project))}>
            <RefreshCw aria-hidden="true" />
          </button>
        )}
        <button type="button" className={ACTION_CLASS} title="重命名" aria-label="重命名" onClick={stop(() => actions.onRename(project))}>
          <Pencil aria-hidden="true" />
        </button>
        <button
          type="button"
          className={ACTION_CLASS}
          title={project.hidden ? '取消隐藏' : '隐藏'}
          aria-label={project.hidden ? '取消隐藏' : '隐藏'}
          onClick={stop(() => actions.onToggleHidden(project))}
        >
          {project.hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
        </button>
        {project.source === 'manual' && (
          <button type="button" className={ACTION_CLASS} title="移除" aria-label="移除" onClick={stop(() => actions.onRemove(project))}>
            <X aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

const LABEL_CLASS = 'px-3 pb-2 text-2xs font-bold tracking-[0.08em] text-fg-subtle uppercase';

export type ProjectRailProps = {
  projects: readonly ProjectMeta[];
  activeId: string | null;
  configError: string | null;
  actions: ProjectActions;
  /** 窄屏下作为抽屉：是否展开 */
  open: boolean;
  onClose: () => void;
};

/** 桌面端固定在左侧；窄屏（< lg）变成从左滑出的抽屉，由顶栏的菜单按钮打开 */
export function ProjectRail({ projects, activeId, configError, actions, open, onClose }: ProjectRailProps) {
  const [showHidden, setShowHidden] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const sorted = sortProjects(projects);
  const visible = sorted.filter((p) => !p.hidden);
  const hidden = sorted.filter((p) => p.hidden);
  const select = (id: string) => {
    actions.onSelect(id);
    onClose();
  };
  const railActions: ProjectActions = { ...actions, onSelect: select };

  // 窄屏抽屉：展开时 Esc 可关，焦点移进抽屉（关闭时焦点由 App 还给菜单按钮）
  useEffect(() => {
    if (!open) return;
    asideRef.current?.querySelector('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !e.isComposing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && <div aria-hidden="true" className="fixed inset-0 top-14 z-30 animate-fade-in bg-(--backdrop) lg:hidden" onClick={onClose} />}
      <aside
        ref={asideRef}
        id="project-rail"
        aria-label="项目"
        className={cn(
          // 窄屏收起时用 invisible：滑出动画走完后才真正隐藏，键盘与读屏就不会进到屏幕外的按钮
          'fixed top-14 bottom-0 left-0 z-30 w-72 -translate-x-full overflow-y-auto border-r border-line bg-surface px-3 py-4 transition-[translate,visibility] duration-300 ease-out max-lg:invisible',
          'lg:sticky lg:z-auto lg:h-[calc(100dvh-3.5rem)] lg:w-64 lg:shrink-0 lg:translate-x-0 lg:bg-surface/50',
          open && 'translate-x-0 shadow-pop max-lg:visible lg:shadow-none',
        )}
      >
        {configError && (
          <div role="alert" className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs leading-relaxed text-rose-700 ring-1 ring-rose-600/20 ring-inset dark:text-rose-300">
            {configError}
          </div>
        )}
        <div className={LABEL_CLASS}>项目 · {visible.length}</div>
        <div className="flex flex-col gap-0.5">
          {visible.map((p) => (
            <RailItem key={p.id} project={p} active={p.id === activeId} actions={railActions} />
          ))}
        </div>
        <button
          type="button"
          onClick={actions.onAdd}
          className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong text-xs font-medium text-fg-subtle transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent-text"
        >
          <Plus aria-hidden="true" className="size-3.5" />
          添加项目路径
        </button>
        {hidden.length > 0 && (
          <div className="mt-5">
            <button
              type="button"
              aria-expanded={showHidden}
              onClick={() => setShowHidden((v) => !v)}
              className={cn(LABEL_CLASS, 'flex w-full items-center gap-1 text-left transition-colors hover:text-fg-muted')}
            >
              <ChevronRight aria-hidden="true" className={cn('size-3 transition-transform', showHidden && 'rotate-90')} />
              已隐藏 · {hidden.length}
            </button>
            {showHidden && (
              <div className="flex flex-col gap-0.5">
                {hidden.map((p) => (
                  <RailItem key={p.id} project={p} active={p.id === activeId} actions={railActions} />
                ))}
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
