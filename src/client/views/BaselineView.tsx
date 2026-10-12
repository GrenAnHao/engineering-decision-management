import type { NoteSummary } from '../../shared/types';
import { clickable } from '../a11y';
import { ClassBadge } from '../components/Badge';
import { KpiRow } from '../components/KpiRow';
import { chambers, cites, pillarAbstract, pillars, type InCount, type KpiTarget } from '../derive';
import { classLabel } from '../labels';

export type BaselineViewProps = {
  notes: readonly NoteSummary[];
  inCount: InCount;
  onOpenNote: (noteId: string) => void;
  onJump: (target: KpiTarget) => void;
};

export function BaselineView({ notes, inCount, onOpenNote, onJump }: BaselineViewProps) {
  return (
    <section className="canvas-view">
      <KpiRow notes={notes} onJump={onJump} />

      <div className="hud-panel" style={{ marginBottom: 28 }}>
        <div className="panel-masthead">
          <span className="panel-headline">
            <span>🏛️</span>
            <span>系统承重墙</span>
          </span>
          <span className="panel-annotation">基于交叉引用入度权重萃取的系统关键协议</span>
        </div>
        <div className="pillars-vault">
          {pillars(notes, inCount).map((n) => (
            <div key={n.id} className="pillar-specimen" {...clickable(() => onOpenNote(n.id))}>
              <div>
                <div className="pillar-meta">
                  <ClassBadge cls={n.cls} />
                  <span className="weight-gauge">被引用 × {cites(inCount, n.id)}</span>
                </div>
                <div className="pillar-core-title">{n.title}</div>
                <div className="pillar-abstract">{pillarAbstract(n)}</div>
              </div>
              <div className="pillar-telemetry">
                <span>{n.date || '进行中'}</span>
                <span>#{n.slug}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hud-panel">
        <div className="panel-masthead">
          <span className="panel-headline">
            <span>🧩</span>
            <span>领域架构分类阵列</span>
          </span>
          <span className="panel-annotation">现行生效的生产事实全景清单</span>
        </div>
        <div className="matrix-chambers">
          {chambers(notes).map(({ cls, notes: col }) => (
            <div key={cls} className="chamber-pod">
              <div className="chamber-header">
                <span className="chamber-name">{classLabel(cls)}</span>
                <span className="chamber-count">{col.length}</span>
              </div>
              <div className="chamber-stream">
                {col.length === 0 && <div className="chamber-empty">// 暂无该类活跃决策</div>}
                {col.map((n) => (
                  <div key={n.id} className="specimen-row" {...clickable(() => onOpenNote(n.id))}>
                    <div className="specimen-title">{n.title}</div>
                    <div className="specimen-info">
                      <span>{n.date || '—'}</span>
                      {cites(inCount, n.id) > 0 && <span className="specimen-cites">↗{cites(inCount, n.id)}</span>}
                    </div>
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
