import type { NoteSummary } from '../../shared/types';
import { computeKpis, type KpiTarget } from '../derive';

export function KpiRow({ notes, onJump }: { notes: readonly NoteSummary[]; onJump: (target: KpiTarget) => void }) {
  return (
    <div className="kpi-row">
      {computeKpis(notes).map((k) => (
        <button key={k.key} type="button" className="kpi-instrument" onClick={() => onJump(k.target)}>
          <div className="kpi-tag">
            <span>{k.label}</span>
            <span className="kpi-dot" style={{ background: k.color }} />
          </div>
          <div className="kpi-num">{k.count}</div>
          <div className="kpi-caption">{k.caption}</div>
          <div className="kpi-accent-bar" style={{ background: k.color }} />
        </button>
      ))}
    </div>
  );
}
