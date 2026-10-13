import { ArrowUpRight, Ban, CircleCheck, Hourglass, Scissors, type LucideIcon } from 'lucide-react';
import type { NoteSummary } from '../../shared/types';
import { computeKpis, type KpiTarget } from '../derive';

const KPI_ICONS: Record<string, LucideIcon> = {
  implemented: CircleCheck,
  proposed: Hourglass,
  rejected: Ban,
  simplification: Scissors,
};

/** 指标卡：数字 + 占全部笔记的比例条，点击跳到决策清单并带上对应筛选 */
export function KpiRow({ notes, onJump }: { notes: readonly NoteSummary[]; onJump: (target: KpiTarget) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {computeKpis(notes).map((k) => {
        const Icon = KPI_ICONS[k.key] ?? CircleCheck;
        const share = notes.length ? Math.round((k.count / notes.length) * 100) : 0;
        return (
          <button
            key={k.key}
            type="button"
            onClick={() => onJump(k.target)}
            title={`查看全部「${k.label}」（占 ${share}%）`}
            className="group relative overflow-hidden rounded-xl bg-surface p-4 text-left shadow-card ring-1 ring-line transition-all duration-200 hover:-translate-y-px hover:shadow-raised hover:ring-line-strong"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg-muted">{k.label}</span>
              <span className="grid size-7 place-items-center rounded-lg" style={{ background: `${k.color}1f`, color: k.color }}>
                <Icon aria-hidden="true" className="size-4" />
              </span>
            </div>
            <div className="font-display tabular mt-3 text-[2.25rem] leading-none font-bold tracking-tight text-fg">{k.count}</div>
            <div className="mt-2 text-xs text-fg-subtle">{k.caption}</div>
            <div aria-hidden="true" className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${share}%`, background: k.color }} />
            </div>
            <ArrowUpRight
              aria-hidden="true"
              className="absolute right-3 bottom-3 size-4 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>
        );
      })}
    </div>
  );
}
