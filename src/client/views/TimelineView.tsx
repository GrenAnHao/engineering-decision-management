import { CalendarDays, History, RotateCcw, SearchX, Tag, type LucideIcon } from 'lucide-react';
import { useId, type Dispatch, type ReactNode } from 'react';
import type { NoteSummary } from '../../shared/types';
import { clickable } from '../a11y';
import { ClassBadge, StatusBadge } from '../components/Badge';
import { classesOf, timeline } from '../derive';
import { plainText } from '../format';
import { classLabel } from '../labels';
import type { FilterAction, Filters } from '../state/filters';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ToggleChip } from '../ui/Chip';
import { Panel } from '../ui/Panel';
import { EmptyState } from '../ui/State';
import { cn } from '../ui/tw';

export type TimelineViewProps = {
  notes: readonly NoteSummary[];
  filters: Filters;
  dispatch: Dispatch<FilterAction>;
  onOpenNote: (noteId: string) => void;
};

// 与架构基线可点击卡片同款的悬停反馈
const CARD_INTERACTIVE =
  'cursor-pointer transition-all duration-200 hover:-translate-y-px hover:shadow-raised hover:ring-accent/40';

/** 一行筛选：标签 + 胶囊条。窄屏标签在上、胶囊条横向滚动；-m-1 p-1 给聚焦描边留位，免得被滚动容器裁掉 */
function FilterRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <span id={labelId} className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-fg-muted sm:h-7 sm:w-24">
        <Icon aria-hidden="true" className="size-3.5 text-fg-subtle" />
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} className="-m-1 flex min-w-0 gap-1.5 overflow-x-auto p-1 sm:flex-1">
        {children}
      </div>
    </div>
  );
}

function TimelineCard({ note, onOpen }: { note: NoteSummary; onOpen: () => void }) {
  return (
    <div {...clickable(onOpen)} className={cn('group relative rounded-xl bg-surface p-4 shadow-card ring-1 ring-line', CARD_INTERACTIVE)}>
      {/* 轴线上的圆点，与首行徽标垂直居中：top = 卡片内边距 1rem + (徽标行 1.25rem - 圆点 0.625rem) / 2 */}
      <span
        aria-hidden="true"
        className="absolute top-5.25 -left-5 size-2.5 rounded-full border-2 border-accent bg-surface transition-colors group-hover:bg-accent group-focus-visible:bg-accent"
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Badge className="font-mono">
          <CalendarDays aria-hidden="true" />
          {note.date}
        </Badge>
        <ClassBadge cls={note.cls} />
        <StatusBadge lifecycle={note.lifecycle} />
      </div>
      <h4 className="mt-2 font-display text-[15px] leading-snug font-bold break-words text-fg">{note.title}</h4>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-fg-muted">{plainText(note.problem || note.decision).slice(0, 180)}…</p>
    </div>
  );
}

export function TimelineView({ notes, filters, dispatch, onOpenNote }: TimelineViewProps) {
  // 数据刷新后已选的月份 / 分类可能已不存在：回落为全部，避免选中项消失而过滤仍生效
  const monthsAll = timeline(notes, '', '').months.map((m) => m.month);
  const month = monthsAll.includes(filters.timelineMonth) ? filters.timelineMonth : '';
  const cls = classesOf(notes).includes(filters.timelineClass) ? filters.timelineClass : '';
  const data = timeline(notes, month, cls);
  const slices = [month, cls ? classLabel(cls) : ''].filter(Boolean);
  const setSlice = (patch: Partial<Filters>) => dispatch({ type: 'set', patch });

  return (
    <section className="animate-view-in space-y-6">
      <Panel icon={History} title="技术演进时间线" annotation="记录架构突破与代码裁撤里程碑" bodyClassName="space-y-6">
        <div className="space-y-3 rounded-lg bg-surface-2/60 p-3 ring-1 ring-line">
          <FilterRow icon={CalendarDays} label="月份切片">
            <ToggleChip pressed={!month} count={data.total} onClick={() => setSlice({ timelineMonth: '' })}>
              全部
            </ToggleChip>
            {data.months.map((m) => (
              <ToggleChip key={m.month} pressed={month === m.month} count={m.count} onClick={() => setSlice({ timelineMonth: m.month })}>
                {m.month}
              </ToggleChip>
            ))}
          </FilterRow>
          <FilterRow icon={Tag} label="分类切片">
            <ToggleChip pressed={!cls} count={data.total} onClick={() => setSlice({ timelineClass: '' })}>
              全部分类
            </ToggleChip>
            {data.classCounts.map((c) => (
              <ToggleChip key={c.cls} pressed={cls === c.cls} count={c.count} onClick={() => setSlice({ timelineClass: c.cls })}>
                {classLabel(c.cls)}
              </ToggleChip>
            ))}
          </FilterRow>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-3">
            <span role="status" className="text-xs text-fg-muted">
              {slices.length
                ? `已切片 [${slices.join(' · ')}] 对应 ${data.filtered.length} 条记录`
                : `全周期全分类共 ${data.filtered.length} 条演化记录`}
            </span>
            <Button size="sm" variant="ghost" className="ml-auto hover:bg-surface-3" onClick={() => dispatch({ type: 'reset-timeline' })}>
              <RotateCcw aria-hidden="true" />
              重置时间线筛选
            </Button>
          </div>
        </div>

        {data.groups.length === 0 ? (
          <EmptyState compact icon={SearchX} title="未找到符合此切片组合的演化记录" />
        ) : (
          <div className="relative">
            {/* 轴线（中心 x = 13px，圆点与月份胶囊都以它对齐）：最新一端取强调色，向下渐隐 */}
            <span
              aria-hidden="true"
              className="absolute top-3 bottom-0 left-3 w-0.5 bg-linear-to-b from-accent via-line-strong via-30% to-transparent"
            />
            <ol className="space-y-8">
              {data.groups.map((g) => (
                <li key={g.month}>
                  <h3 className="relative mb-3 flex h-6 w-fit items-center rounded-full bg-surface px-3 font-mono text-[11px] font-semibold text-accent-text shadow-card ring-1 ring-line-strong">
                    {g.month} · {g.notes.length} 条
                  </h3>
                  <ol className="space-y-3 pl-7">
                    {g.notes.map((n) => (
                      <li key={n.id}>
                        <TimelineCard note={n} onOpen={() => onOpenNote(n.id)} />
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Panel>
    </section>
  );
}
