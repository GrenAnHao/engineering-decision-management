import { Ban, CircleCheck, Lightbulb, ShieldAlert } from 'lucide-react';
import type { Dispatch } from 'react';
import type { NoteSummary } from '../../shared/types';
import { clickable } from '../a11y';
import { ClassBadge } from '../components/Badge';
import { pitfalls, type Pitfall } from '../derive';
import type { FilterAction } from '../state/filters';
import { SearchField } from '../ui/Field';
import { Panel } from '../ui/Panel';
import { EmptyState } from '../ui/State';
import { cn } from '../ui/tw';

export type AlternativesViewProps = {
  notes: readonly NoteSummary[];
  query: string;
  dispatch: Dispatch<FilterAction>;
  onOpenNote: (noteId: string) => void;
};

/** 悬停描边用玫红（呼应「被否决」），不用通用的强调色 */
const CARD_CLASS = cn(
  'flex cursor-pointer flex-col justify-between gap-4 rounded-xl bg-surface p-4 shadow-card ring-1 ring-line',
  'transition-all duration-200 hover:-translate-y-px hover:shadow-raised hover:ring-rose-500/40',
);

/** 软底色提示条，配色与 ui/Badge 一致；放弃项左侧多一道玫红竖条（overflow-hidden 让它贴合圆角） */
const STRIP_CLASS = 'flex items-start gap-2 rounded-lg ring-1 ring-inset';
const HAZARD_CLASS = cn(
  STRIP_CLASS,
  'relative overflow-hidden bg-rose-500/10 py-2.5 pr-3 pl-4 text-[13px] leading-normal font-semibold text-rose-700 ring-rose-600/20 dark:text-rose-300 dark:ring-rose-400/25',
  'before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-rose-500',
);
const VERDICT_CLASS = cn(
  STRIP_CLASS,
  'bg-emerald-500/10 px-3 py-2 text-xs leading-normal font-semibold text-emerald-700 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/25',
);

function PitfallCard({ item, onOpen }: { item: Pitfall; onOpen: () => void }) {
  return (
    <div {...clickable(onOpen)} className={CARD_CLASS}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <ClassBadge cls={item.cls} />
          <span className="min-w-0 truncate font-mono text-[11px] text-fg-subtle">#{item.slug}</span>
        </div>
        <div className={HAZARD_CLASS}>
          <Ban aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">放弃备选：{item.discarded}</span>
        </div>
        <div className="flex items-start gap-2 text-[13px] leading-relaxed text-fg-muted">
          <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
          <p className="line-clamp-4 min-w-0 break-words">权衡依据：{item.crux}</p>
        </div>
      </div>
      <div className={VERDICT_CLASS}>
        <CircleCheck aria-hidden="true" className="mt-px size-4 shrink-0" />
        <span className="line-clamp-2 min-w-0 break-words">{item.winner}</span>
      </div>
    </div>
  );
}

export function AlternativesView({ notes, query, dispatch, onOpenNote }: AlternativesViewProps) {
  const items = pitfalls(notes, query);
  return (
    <section className="animate-view-in space-y-6">
      <Panel
        icon={ShieldAlert}
        title="避坑与反思智库"
        annotation="记录「为什么放弃了方案 B」与被否决的提案，防止重复踩坑"
        bodyClassName="space-y-4"
      >
        <SearchField
          className="max-w-xl"
          aria-label="检索被否决方案"
          placeholder="检索被否决方案关键字（如：SQLite、多进程、Redis…）"
          value={query}
          onValueChange={(altQuery) => dispatch({ type: 'set', patch: { altQuery } })}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.length === 0 && <EmptyState compact title="未检索到相关避坑记录" className="col-span-full" />}
          {items.map((it) => (
            <PitfallCard key={it.key} item={it} onOpen={() => onOpenNote(it.noteId)} />
          ))}
        </div>
      </Panel>
    </section>
  );
}
