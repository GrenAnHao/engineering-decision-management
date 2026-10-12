import { useReducer } from 'react';
import type { NotesResponse, ProjectMeta } from '../../shared/types';
import type { KpiTarget } from '../derive';
import type { ViewId } from '../router';
import { filtersReducer, INITIAL_FILTERS } from '../state/filters';
import { AlternativesView } from './AlternativesView';
import { BaselineView } from './BaselineView';
import { DirectoryView } from './DirectoryView';
import { TimelineView } from './TimelineView';

export type WorkspaceProps = {
  project: ProjectMeta;
  data: NotesResponse | null;
  error: string | null;
  view: ViewId;
  query: string;
  onClearQuery: () => void;
  onViewChange: (view: ViewId) => void;
  onOpenNote: (noteId: string) => void;
  onRescan: () => void;
};

/**
 * 单个项目的画布。父组件以项目 id 作 key：切项目时整个组件重建，筛选状态随之重置；
 * 切视图只换子视图，筛选保留。
 */
export function Workspace({ project, data, error, view, query, onClearQuery, onViewChange, onOpenNote, onRescan }: WorkspaceProps) {
  const [filters, dispatch] = useReducer(filtersReducer, INITIAL_FILTERS);

  if (!project.healthy) {
    return (
      <div className="state-panel">
        <h2>项目路径失效</h2>
        <p>
          找不到 <code>{project.path}\.agents\notes</code>。{project.error}
        </p>
        <button type="button" className="action-btn-primary" onClick={onRescan}>
          重新扫描
        </button>
      </div>
    );
  }
  if (!data) {
    return error ? (
      <div className="state-panel">
        <h2>加载失败</h2>
        <p>{error}</p>
      </div>
    ) : (
      <>
        <div className="skeleton-block" />
        <div className="skeleton-block tall" />
      </>
    );
  }
  if (data.notes.length === 0) {
    return (
      <div className="state-panel">
        <h2>{project.displayName} 暂无决策笔记</h2>
        <p>
          在 <code>.agents/notes/&lt;lifecycle&gt;/&lt;class&gt;/</code> 下新建笔记后，这里会自动出现。
        </p>
      </div>
    );
  }

  const { notes, inCount } = data;
  const jump = (target: KpiTarget) => {
    dispatch({ type: 'jump', target });
    onClearQuery();
    onViewChange('directory');
  };

  switch (view) {
    case 'baseline':
      return <BaselineView notes={notes} inCount={inCount} onOpenNote={onOpenNote} onJump={jump} />;
    case 'timeline':
      return <TimelineView notes={notes} filters={filters} dispatch={dispatch} onOpenNote={onOpenNote} />;
    case 'alternatives':
      return <AlternativesView notes={notes} query={filters.altQuery} dispatch={dispatch} onOpenNote={onOpenNote} />;
    case 'directory':
      return (
        <DirectoryView
          notes={notes}
          inCount={inCount}
          filters={filters}
          dispatch={dispatch}
          query={query}
          onClearQuery={onClearQuery}
          onOpenNote={onOpenNote}
        />
      );
  }
}
