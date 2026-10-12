import { useState } from 'react';
import { LIFECYCLES, type ProjectMeta } from '../../shared/types';
import { relativeTime } from '../format';
import { LIFECYCLE_COLORS, projectColor } from '../labels';

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

function RailItem({ project, active, actions }: { project: ProjectMeta; active: boolean; actions: ProjectActions }) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const classes = ['rail-item', active ? 'active' : '', project.healthy ? '' : 'unhealthy'].filter(Boolean).join(' ');
  return (
    <div className={classes} title={project.path}>
      <button
        type="button"
        className="rail-main"
        aria-current={active ? 'true' : undefined}
        onClick={() => actions.onSelect(project.id)}
      >
        <span className="rail-top">
          <span className="rail-dot" style={{ background: projectColor(project.order) }} />
          <span className="rail-name">{project.displayName}</span>
          {project.healthy && project.watchMode === 'live' && <span className="rail-live" title="实时监听中" />}
        </span>
        <span className="rail-meta">
          {project.count} 条 · {relativeTime(project.lastChangeAt)}
        </span>
        {project.count > 0 && (
          <span className="rail-bar">
            {LIFECYCLES.filter((l) => project.counts[l] > 0).map((l) => (
              <i key={l} style={{ background: LIFECYCLE_COLORS[l], flexGrow: project.counts[l] }} />
            ))}
          </span>
        )}
        {!project.healthy && <span className="rail-tag">路径失效</span>}
        {project.healthy && project.watchMode === 'manual' && <span className="rail-tag manual">手动刷新</span>}
      </button>
      <div className="rail-actions">
        {project.watchMode === 'manual' && (
          <button type="button" className="rail-action" title="重新扫描" onClick={stop(() => actions.onRescan(project))}>
            ↻
          </button>
        )}
        <button type="button" className="rail-action" title="重命名" onClick={stop(() => actions.onRename(project))}>
          ✎
        </button>
        <button type="button" className="rail-action" title={project.hidden ? '取消隐藏' : '隐藏'} onClick={stop(() => actions.onToggleHidden(project))}>
          {project.hidden ? '显' : '隐'}
        </button>
        {project.source === 'manual' && (
          <button type="button" className="rail-action" title="移除" onClick={stop(() => actions.onRemove(project))}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export function ProjectRail({
  projects,
  activeId,
  configError,
  actions,
}: {
  projects: readonly ProjectMeta[];
  activeId: string | null;
  configError: string | null;
  actions: ProjectActions;
}) {
  const [showHidden, setShowHidden] = useState(false);
  const sorted = sortProjects(projects);
  const visible = sorted.filter((p) => !p.hidden);
  const hidden = sorted.filter((p) => p.hidden);
  return (
    <aside className="project-rail">
      {configError && <div className="rail-config-error">{configError}</div>}
      <div className="rail-label">项目 {visible.length}</div>
      {visible.map((p) => (
        <RailItem key={p.id} project={p} active={p.id === activeId} actions={actions} />
      ))}
      <button type="button" className="rail-add" onClick={actions.onAdd}>
        + 添加项目路径
      </button>
      {hidden.length > 0 && (
        <>
          <div className="rail-label section">
            <span>已隐藏 {hidden.length}</span>
            <button type="button" className="link-btn" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? '收起' : '展开'}
            </button>
          </div>
          {showHidden && hidden.map((p) => <RailItem key={p.id} project={p} active={p.id === activeId} actions={actions} />)}
        </>
      )}
    </aside>
  );
}
