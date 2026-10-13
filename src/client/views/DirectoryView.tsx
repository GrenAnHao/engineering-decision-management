import { ArrowUpRight } from 'lucide-react';
import type { Dispatch } from 'react';
import { clickable } from '../a11y';
import { LIFECYCLES, type Lifecycle, type NoteSummary } from '../../shared/types';
import { ClassBadge, StatusBadge } from '../components/Badge';
import { cites, classesOf, directory, type InCount, type SortMode } from '../derive';
import { classLabel, STATUS_LABELS } from '../labels';
import type { FilterAction, Filters } from '../state/filters';
import { Button } from '../ui/Button';
import { SearchField, Select } from '../ui/Field';
import { EmptyState } from '../ui/State';
import { cn } from '../ui/tw';

export type DirectoryViewProps = {
  notes: readonly NoteSummary[];
  inCount: InCount;
  filters: Filters;
  dispatch: Dispatch<FilterAction>;
  /** 顶栏全局搜索词，同时作为清单的关键字过滤 */
  query: string;
  onQueryChange: (query: string) => void;
  onOpenNote: (noteId: string) => void;
};

/**
 * 表头与数据行共用的列模板：编号 / 分类 / 标题 / 状态 / 日期 / 引用。
 * 左栏占去 256px 后，xl 以下的标题列只剩 150～400px，而真实标题常有 40～100 字，
 * 所以 xl 以下改为两行堆叠（标题在上，徽标与日期在下）、不画表头。
 */
const COLUMNS = 'xl:grid-cols-[3.5rem_7.5rem_minmax(0,1fr)_6rem_6.5rem_3.5rem]';
const HEAD_LABELS = ['编号', '分类', '标题', '状态', '日期', '引用'];
const HEAD_CLASS = cn(
  'hidden border-b border-line bg-surface-2/60 px-5 py-2.5 text-2xs font-bold tracking-[0.08em] text-fg-subtle xl:grid xl:gap-x-4',
  COLUMNS,
);
/** 行内焦点环收进行内：行贴着 overflow-hidden 的卡片边，默认的外扩描边会被裁掉 */
const ROW_CLASS = cn(
  'flex cursor-pointer flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-3 transition-colors hover:bg-surface-2/60 focus-visible:-outline-offset-2',
  'xl:grid xl:gap-x-4 xl:px-5',
  COLUMNS,
);

type RowProps = { note: NoteSummary; position: number; cited: number; onOpen: () => void };

function DirectoryRow({ note, position, cited, onOpen }: RowProps) {
  return (
    <div {...clickable(onOpen)} className={ROW_CLASS}>
      <span className="tabular hidden font-mono text-[11px] text-fg-subtle xl:block">#{String(position).padStart(3, '0')}</span>
      <ClassBadge cls={note.cls} />
      {/* 堆叠时标题排到最前并独占一行；长串无空格文本也要折行，免得撑出横向滚动 */}
      <span className="order-first line-clamp-2 min-w-0 basis-full text-[13.5px] leading-snug font-semibold break-words text-fg xl:order-none">
        {note.title}
      </span>
      <StatusBadge lifecycle={note.lifecycle} />
      <span className="font-mono text-[11px] text-fg-muted">{note.date || '—'}</span>
      {cited > 0 && (
        <span title="被引用次数" className="tabular ml-auto inline-flex items-center gap-0.5 font-mono text-[11px] font-bold text-accent-text">
          <ArrowUpRight aria-hidden="true" className="size-3" />
          {cited}
        </span>
      )}
    </div>
  );
}

export function DirectoryView({ notes, inCount, filters, dispatch, query, onQueryChange, onOpenNote }: DirectoryViewProps) {
  const classes = classesOf(notes);
  // 数据刷新后已选分类可能已不存在：回落为全部，避免下拉框空白而过滤仍生效
  const cls = classes.includes(filters.cls) ? filters.cls : '';
  const list = directory(notes, inCount, { status: filters.status, cls, sort: filters.sort, query });
  const set = (patch: Partial<Filters>) => dispatch({ type: 'set', patch });
  return (
    <section className="animate-view-in space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3 shadow-card ring-1 ring-line">
        <SearchField
          className="min-w-[12rem] flex-1"
          aria-label="筛选决策"
          placeholder="筛选标题、slug、背景…"
          value={query}
          onValueChange={onQueryChange}
          clearLabel="清除关键字"
        />
        <Select aria-label="按状态筛选" value={filters.status} onChange={(e) => set({ status: e.target.value as Lifecycle | '' })}>
          <option value="">状态：全部</option>
          {LIFECYCLES.map((s) => (
            <option key={s} value={s}>
              状态：{STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select aria-label="按分类筛选" value={cls} onChange={(e) => set({ cls: e.target.value })}>
          <option value="">分类：全部</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              分类：{classLabel(c)}
            </option>
          ))}
        </Select>
        <Select aria-label="排序方式" value={filters.sort} onChange={(e) => set({ sort: e.target.value as SortMode })}>
          <option value="new">排序：最新优先</option>
          <option value="old">排序：最早优先</option>
          <option value="cites">排序：引用最多</option>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          title="清空全部筛选条件"
          onClick={() => {
            dispatch({ type: 'reset-directory' });
            onQueryChange('');
          }}
        >
          重置筛选
        </Button>
        <span className="tabular ml-auto font-mono text-[11px] text-fg-subtle">匹配 {list.length} 条</span>
      </div>

      <div className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
        <div className={HEAD_CLASS}>
          {HEAD_LABELS.map((label) => (
            <span key={label} className="last:text-right">
              {label}
            </span>
          ))}
        </div>
        {list.length === 0 ? (
          <EmptyState compact title="没有匹配的决策记录" />
        ) : (
          <div className="divide-y divide-line">
            {list.map((n, i) => (
              <DirectoryRow key={n.id} note={n} position={i + 1} cited={cites(inCount, n.id)} onOpen={() => onOpenNote(n.id)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
