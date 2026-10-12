import type { ProjectMeta } from '../../shared/types';
import { VIEW_LABELS, VIEWS, type ViewId } from '../router';
import type { SyncStatus } from '../state/useHub';
import { SearchBox, type SearchBoxProps } from './SearchPopover';

export type TopBarProps = {
  project: ProjectMeta | null;
  projects: readonly ProjectMeta[];
  view: ViewId;
  status: SyncStatus;
  onViewChange: (view: ViewId) => void;
  onRescan: (projectId: string) => void;
  search: SearchBoxProps;
};

function Beacon({ project, projects, status, onRescan }: Pick<TopBarProps, 'project' | 'projects' | 'status' | 'onRescan'>) {
  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <div className="sync-beacon">
        <span className="radar-dot syncing" />
        {status === 'connecting' ? '连接中…' : '连接断开，重连中…'}
      </div>
    );
  }
  if (project && project.watchMode === 'manual') {
    return (
      <button type="button" className="sync-beacon" title="该项目无法实时监听，点击手动刷新" onClick={() => onRescan(project.id)}>
        <span className="radar-dot" />
        手动刷新模式 · 点击刷新
      </button>
    );
  }
  const live = projects.filter((p) => p.watchMode === 'live' && p.healthy).length;
  return (
    <div className="sync-beacon">
      <span className={`radar-dot ${status === 'polling' ? 'syncing' : 'active'}`} />
      {status === 'polling' ? '轮询同步（30 s）' : `${live} 个项目监听中`}
    </div>
  );
}

export function TopBar(props: TopBarProps) {
  const { project, view, onViewChange, search } = props;
  return (
    <header className="hud-topbar">
      <div className="brand-group">
        <div className="brand-logo" />
        <div className="brand-text">
          <span>工程决策中心</span>
          {project && (
            <span className="telemetry-chip">
              {project.displayName} · {project.count} 条
            </span>
          )}
        </div>
      </div>
      <nav className="deck-tabs">
        {VIEWS.map((v) => (
          <button key={v} type="button" className={`deck-tab${v === view ? ' active' : ''}`} onClick={() => onViewChange(v)}>
            {VIEW_LABELS[v]}
          </button>
        ))}
      </nav>
      <div className="hud-grow" />
      <SearchBox {...search} />
      <Beacon {...props} />
    </header>
  );
}
