import type { Dispatch } from 'react';
import { clickable } from '../a11y';
import { LIFECYCLES, type Lifecycle, type NoteSummary } from '../../shared/types';
import { ClassBadge, StatusBadge } from '../components/Badge';
import { cites, classesOf, directory, type InCount, type SortMode } from '../derive';
import { classLabel, STATUS_LABELS } from '../labels';
import type { FilterAction, Filters } from '../state/filters';

export type DirectoryViewProps = {
  notes: readonly NoteSummary[];
  inCount: InCount;
  filters: Filters;
  dispatch: Dispatch<FilterAction>;
  /** 顶栏全局搜索词，同时作为清单的关键字过滤 */
  query: string;
  onClearQuery: () => void;
  onOpenNote: (noteId: string) => void;
};

export function DirectoryView({ notes, inCount, filters, dispatch, query, onClearQuery, onOpenNote }: DirectoryViewProps) {
  const classes = classesOf(notes);
  // 数据刷新后已选分类可能已不存在：回落为全部，避免下拉框空白而过滤仍生效
  const cls = classes.includes(filters.cls) ? filters.cls : '';
  const list = directory(notes, inCount, { status: filters.status, cls, sort: filters.sort, query });
  return (
    <section className="canvas-view">
      <div className="matrix-toolbar">
        <select value={filters.status} onChange={(e) => dispatch({ type: 'set', patch: { status: e.target.value as Lifecycle | '' } })}>
          <option value="">状态：全部</option>
          {LIFECYCLES.map((s) => (
            <option key={s} value={s}>
              状态：{STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={cls} onChange={(e) => dispatch({ type: 'set', patch: { cls: e.target.value } })}>
          <option value="">分类：全部</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              分类：{classLabel(c)}
            </option>
          ))}
        </select>
        <select value={filters.sort} onChange={(e) => dispatch({ type: 'set', patch: { sort: e.target.value as SortMode } })}>
          <option value="new">排序：最新优先</option>
          <option value="old">排序：最早优先</option>
          <option value="cites">排序：引用最多</option>
        </select>
        <button
          type="button"
          className="link-btn"
          title="清空全部筛选条件"
          onClick={() => {
            dispatch({ type: 'reset-directory' });
            onClearQuery();
          }}
        >
          重置筛选
        </button>
        {query.trim() && (
          <span className="matrix-query-chip">
            关键字：{query.trim()}
            <button type="button" className="link-btn" onClick={onClearQuery}>
              ✕
            </button>
          </span>
        )}
        <span className="matrix-count">匹配 {list.length} 条</span>
      </div>

      <div className="matrix-board">
        <div className="matrix-row-head">
          <span>编号</span>
          <span>分类</span>
          <span>标题</span>
          <span>状态</span>
          <span>日期</span>
          <span style={{ textAlign: 'right' }}>引用</span>
        </div>
        {list.length === 0 && <div className="empty-hint">// 没有匹配的决策记录</div>}
        {list.map((n, i) => (
          <div key={n.id} className="matrix-row-cell" {...clickable(() => onOpenNote(n.id))}>
            <span className="cell-index">#{String(i + 1).padStart(3, '0')}</span>
            <span>
              <ClassBadge cls={n.cls} />
            </span>
            <span className="cell-title">{n.title}</span>
            <span>
              <StatusBadge lifecycle={n.lifecycle} />
            </span>
            <span className="cell-date">{n.date || '—'}</span>
            <span className="cell-cites">{cites(inCount, n.id) > 0 ? `↗ ${cites(inCount, n.id)}` : ''}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
