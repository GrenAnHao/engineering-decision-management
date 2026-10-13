import { CircleAlert, FileText, FolderX } from 'lucide-react';
import { useEffect, useReducer } from 'react';
import type { NotesResponse, ProjectMeta } from '../../shared/types';
import type { KpiTarget } from '../derive';
import type { ViewId } from '../router';
import { filtersReducer, INITIAL_FILTERS } from '../state/filters';
import { Button } from '../ui/Button';
import { DashboardSkeleton, EmptyState } from '../ui/State';
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
  /** 自增即表示「从别处跳来看全部匹配」：清掉决策清单里残留的状态 / 分类筛选，免得匹配数对不上 */
  directoryResetTick: number;
  onQueryChange: (query: string) => void;
  onViewChange: (view: ViewId) => void;
  onOpenNote: (noteId: string) => void;
  onRescan: () => void;
  onRetry: () => void;
};

const CODE_CLASS = 'rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs break-all ring-1 ring-line';

/**
 * 单个项目的画布。父组件以项目 id 作 key：切项目时整个组件重建，筛选状态随之重置；
 * 切视图只换子视图，筛选保留。
 */
export function Workspace({ project, data, error, view, query, directoryResetTick, onQueryChange, onViewChange, onOpenNote, onRescan, onRetry }: WorkspaceProps) {
  const [filters, dispatch] = useReducer(filtersReducer, INITIAL_FILTERS);
  useEffect(() => {
    if (directoryResetTick > 0) dispatch({ type: 'reset-directory' });
  }, [directoryResetTick]);

  if (!project.healthy) {
    return (
      <EmptyState
        icon={FolderX}
        title="项目路径失效"
        action={
          <Button variant="primary" onClick={onRescan}>
            重新扫描
          </Button>
        }
      >
        找不到 <code className={CODE_CLASS}>{project.path}\.agents\notes</code>。{project.error}
      </EmptyState>
    );
  }
  if (!data) {
    return error ? (
      <EmptyState
        icon={CircleAlert}
        title="加载失败"
        action={
          <Button variant="primary" onClick={onRetry}>
            重试
          </Button>
        }
      >
        {error}
      </EmptyState>
    ) : (
      <DashboardSkeleton />
    );
  }
  if (data.notes.length === 0) {
    return (
      <EmptyState icon={FileText} title={`${project.displayName} 暂无决策笔记`}>
        在 <code className={CODE_CLASS}>.agents/notes/&lt;lifecycle&gt;/&lt;class&gt;/</code> 下新建笔记后，这里会自动出现。
      </EmptyState>
    );
  }

  const { notes, inCount } = data;
  const jump = (target: KpiTarget) => {
    dispatch({ type: 'jump', target });
    onQueryChange('');
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
          onQueryChange={onQueryChange}
          onOpenNote={onOpenNote}
        />
      );
  }
}
