import { ArrowUpRight, Landmark, LayoutGrid } from 'lucide-react';
import type { NoteSummary } from '../../shared/types';
import { clickable } from '../a11y';
import { ClassBadge } from '../components/Badge';
import { KpiRow } from '../components/KpiRow';
import { chambers, cites, pillarAbstract, pillars, type InCount, type KpiTarget } from '../derive';
import { classLabel, classTone } from '../labels';
import { Badge, TONE_DOT } from '../ui/Badge';
import { Panel } from '../ui/Panel';
import { cn } from '../ui/tw';

export type BaselineViewProps = {
  notes: readonly NoteSummary[];
  inCount: InCount;
  onOpenNote: (noteId: string) => void;
  onJump: (target: KpiTarget) => void;
};

const CARD_INTERACTIVE =
  'cursor-pointer transition-all duration-200 hover:-translate-y-px hover:shadow-raised hover:ring-accent/40';

function PillarCard({ note, count, onOpen }: { note: NoteSummary; count: number; onOpen: () => void }) {
  return (
    <div {...clickable(onOpen)} className={cn('group flex min-w-0 flex-col gap-3 rounded-xl bg-surface p-4 shadow-card ring-1 ring-line', CARD_INTERACTIVE)}>
      <div className="flex items-center justify-between gap-2">
        <ClassBadge cls={note.cls} />
        <span className="tabular inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-2xs font-bold text-accent-text">
          <ArrowUpRight aria-hidden="true" className="size-3" />
          被引用 {count}
        </span>
      </div>
      <div>
        <h3 className="line-clamp-2 font-display text-[15px] leading-snug font-bold text-fg">{note.title}</h3>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-fg-muted">{pillarAbstract(note)}</p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 font-mono text-[11px] text-fg-subtle">
        <span className="shrink-0">{note.date || '进行中'}</span>
        <span className="truncate">#{note.slug}</span>
      </div>
    </div>
  );
}

export function BaselineView({ notes, inCount, onOpenNote, onJump }: BaselineViewProps) {
  return (
    <section className="animate-view-in space-y-6">
      <KpiRow notes={notes} onJump={onJump} />

      <Panel icon={Landmark} title="系统承重墙" annotation="基于交叉引用入度权重萃取的系统关键协议">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pillars(notes, inCount).map((n) => (
            <PillarCard key={n.id} note={n} count={cites(inCount, n.id)} onOpen={() => onOpenNote(n.id)} />
          ))}
        </div>
      </Panel>

      <Panel icon={LayoutGrid} title="领域架构分类阵列" annotation="现行生效的生产事实全景清单">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {chambers(notes).map(({ cls, notes: col }) => (
            <div key={cls} className="flex min-w-0 flex-col rounded-xl bg-surface-2/60 ring-1 ring-line">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <span className="flex items-center gap-2 text-[13px] font-bold text-fg">
                  <span aria-hidden="true" className={cn('size-2 rounded-[3px]', TONE_DOT[classTone(cls)])} />
                  {classLabel(cls)}
                </span>
                <span className="tabular rounded-md bg-surface px-1.5 text-2xs leading-5 font-semibold text-fg-subtle ring-1 ring-line">{col.length}</span>
              </div>
              <div className="flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto p-2">
                {col.length === 0 && <div className="px-2 py-5 text-center text-xs text-fg-subtle">暂无该类活跃决策</div>}
                {col.map((n) => (
                  <div
                    key={n.id}
                    {...clickable(() => onOpenNote(n.id))}
                    className={cn('flex flex-col gap-1 rounded-lg bg-surface px-3 py-2 shadow-card ring-1 ring-line', CARD_INTERACTIVE, 'hover:translate-y-0 hover:translate-x-px')}
                  >
                    <div className="truncate text-[13px] font-semibold text-fg">{n.title}</div>
                    <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-fg-subtle">
                      <span className="flex items-center gap-2">
                        {n.date || '—'}
                        {n.lifecycle === 'proposed' && <Badge tone="amber">待评审</Badge>}
                      </span>
                      {cites(inCount, n.id) > 0 && (
                        <span className="tabular inline-flex items-center gap-0.5 font-bold text-accent-text" title="被引用次数">
                          <ArrowUpRight aria-hidden="true" className="size-3" />
                          {cites(inCount, n.id)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}
