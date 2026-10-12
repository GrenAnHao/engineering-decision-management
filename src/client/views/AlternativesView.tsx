import type { Dispatch } from 'react';
import type { NoteSummary } from '../../shared/types';
import { ClassBadge } from '../components/Badge';
import { pitfalls } from '../derive';
import type { FilterAction } from '../state/filters';

export type AlternativesViewProps = {
  notes: readonly NoteSummary[];
  query: string;
  dispatch: Dispatch<FilterAction>;
  onOpenNote: (noteId: string) => void;
};

export function AlternativesView({ notes, query, dispatch, onOpenNote }: AlternativesViewProps) {
  const items = pitfalls(notes, query);
  return (
    <section className="canvas-view">
      <div className="hud-panel">
        <div className="panel-masthead">
          <span className="panel-headline">
            <span>🛡️</span>
            <span>避坑与反思智库</span>
          </span>
          <span className="panel-annotation">记录「为什么放弃了方案 B」与被否决的提案，防止重复踩坑</span>
        </div>
        <div className="alt-controls">
          <input
            type="text"
            className="alt-search-input"
            placeholder="检索被否决方案关键字（如：SQLite、多进程、Redis...）"
            value={query}
            onChange={(e) => dispatch({ type: 'set', patch: { altQuery: e.target.value } })}
          />
        </div>
        <div className="pitfalls-grid">
          {items.length === 0 && <div className="empty-hint" style={{ gridColumn: '1 / -1' }}>// 未检索到相关避坑记录</div>}
          {items.map((it) => (
            <div key={it.key} className="pitfall-dossier" onClick={() => onOpenNote(it.noteId)}>
              <div>
                <div className="pitfall-head">
                  <ClassBadge cls={it.cls} />
                  <span className="pitfall-slug">#{it.slug}</span>
                </div>
                <div className="hazard-banner">🚫 放弃备选：{it.discarded}</div>
                <div className="crux-evidence">💡 权衡依据：{it.crux}</div>
              </div>
              <div className="triumphant-verdict">✅ {it.winner}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
