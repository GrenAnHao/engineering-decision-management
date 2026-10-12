import type { Dispatch } from 'react';
import type { NoteSummary } from '../../shared/types';
import { ClassBadge, StatusBadge } from '../components/Badge';
import { timeline } from '../derive';
import { plainText } from '../format';
import { classLabel } from '../labels';
import type { FilterAction, Filters } from '../state/filters';

export type TimelineViewProps = {
  notes: readonly NoteSummary[];
  filters: Filters;
  dispatch: Dispatch<FilterAction>;
  onOpenNote: (noteId: string) => void;
};

export function TimelineView({ notes, filters, dispatch, onOpenNote }: TimelineViewProps) {
  const { timelineMonth: month, timelineClass: cls } = filters;
  const data = timeline(notes, month, cls);
  const slices = [month, cls ? classLabel(cls) : ''].filter(Boolean);

  return (
    <section className="canvas-view">
      <div className="hud-panel">
        <div className="panel-masthead">
          <span className="panel-headline">
            <span>⏱️</span>
            <span>技术演进时间线</span>
          </span>
          <span className="panel-annotation">记录架构突破与代码裁撤里程碑</span>
        </div>

        <div className="timeline-toolbar">
          <div className="filter-row">
            <span className="filter-group-label">📅 月份切片:</span>
            <div className="month-pills">
              <button type="button" className={`month-pill${!month ? ' active' : ''}`} onClick={() => dispatch({ type: 'set', patch: { timelineMonth: '' } })}>
                全部 ({data.total})
              </button>
              {data.months.map((m) => (
                <button
                  key={m.month}
                  type="button"
                  className={`month-pill${month === m.month ? ' active' : ''}`}
                  onClick={() => dispatch({ type: 'set', patch: { timelineMonth: m.month } })}
                >
                  {m.month} ({m.count})
                </button>
              ))}
            </div>
          </div>
          <div className="filter-row">
            <span className="filter-group-label">🏷️ 分类切片:</span>
            <div className="class-pills">
              <button type="button" className={`class-pill${!cls ? ' active' : ''}`} onClick={() => dispatch({ type: 'set', patch: { timelineClass: '' } })}>
                全部分类 ({data.total})
              </button>
              {data.classCounts.map((c) => (
                <button
                  key={c.cls}
                  type="button"
                  className={`class-pill${cls === c.cls ? ' active' : ''}`}
                  onClick={() => dispatch({ type: 'set', patch: { timelineClass: c.cls } })}
                >
                  {classLabel(c.cls)} ({c.count})
                </button>
              ))}
            </div>
          </div>
          <div className="filter-summary-bar">
            <span>
              {slices.length
                ? `已切片 [${slices.join(' · ')}] 对应 ${data.filtered.length} 条记录`
                : `全周期全分类共 ${data.filtered.length} 条演化记录`}
            </span>
            <button type="button" className="link-btn" onClick={() => dispatch({ type: 'reset-timeline' })}>
              重置时间线筛选
            </button>
          </div>
        </div>

        <div className="chrono-track">
          {data.groups.length === 0 && <div className="empty-hint">// 未找到符合此切片组合的演化记录</div>}
          {data.groups.map((g) => (
            <div key={g.month} className="chrono-node-epoch">
              <div className="chrono-epoch-badge">
                {g.month} · {g.notes.length} 条
              </div>
              <div className="chrono-cards">
                {g.notes.map((n) => (
                  <div key={n.id} className="chrono-card" onClick={() => onOpenNote(n.id)}>
                    <div className="chrono-pulse" />
                    <div className="chrono-meta-row">
                      <span className="chrono-date-badge">📅 {n.date}</span>
                      <ClassBadge cls={n.cls} />
                      <StatusBadge lifecycle={n.lifecycle} />
                      <span className="chrono-heading">{n.title}</span>
                    </div>
                    <div className="chrono-body">{plainText(n.problem || n.decision).slice(0, 180)}…</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
