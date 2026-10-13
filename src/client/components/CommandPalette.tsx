import { ArrowUpRight, CornerDownLeft, FileText, ListFilter, Search, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import type { NoteSummary } from '../../shared/types';
import { cites, searchNotes, type InCount } from '../derive';
import { Kbd } from '../ui/Kbd';
import { Modal } from '../ui/Modal';
import { cn } from '../ui/tw';
import { ClassBadge } from './Badge';

export type PaletteCommand = {
  id: string;
  /** 分组标题，同组的命令要相邻排列 */
  group: string;
  label: string;
  /** 行尾的小字提示，如「当前」「35 条」 */
  hint?: string;
  /** 只参与匹配、不显示的别名 */
  keywords?: string;
  icon: LucideIcon;
  run: () => void;
};

export type Entry =
  | { kind: 'note'; key: string; group: string; note: NoteSummary }
  | { kind: 'all'; key: string; group: string; total: number }
  | { kind: 'command'; key: string; group: string; command: PaletteCommand };

const RECENT_LIMIT = 5;
const NOTE_LIMIT = 8;
const RECENT_GROUP = '最近的决策';
const NOTE_GROUP = '决策';

/** 面板里要显示的条目：无关键字时是最近的决策 + 全部命令；有关键字时是匹配的决策 + 匹配的命令 */
export function buildEntries(query: string, notes: readonly NoteSummary[], commands: readonly PaletteCommand[]): Entry[] {
  const q = query.trim();
  const asCommand = (command: PaletteCommand): Entry => ({ kind: 'command', key: `cmd:${command.id}`, group: command.group, command });
  if (!q) {
    const recent = notes
      .filter((n) => n.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, RECENT_LIMIT)
      .map((note): Entry => ({ kind: 'note', key: `note:${note.id}`, group: RECENT_GROUP, note }));
    return [...recent, ...commands.map(asCommand)];
  }
  const { total, top } = searchNotes(notes, q, NOTE_LIMIT);
  const needle = q.toLowerCase();
  return [
    ...top.map((note): Entry => ({ kind: 'note', key: `note:${note.id}`, group: NOTE_GROUP, note })),
    ...(total > 0 ? [{ kind: 'all', key: 'all', group: NOTE_GROUP, total } satisfies Entry] : []),
    ...commands.filter((c) => `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(needle)).map(asCommand),
  ];
}

/** 把相邻同组的条目归并成组，每项带上它在整个列表里的序号（键盘导航与 aria-activedescendant 都按这个序号） */
export function groupEntries(entries: readonly Entry[]): { group: string; items: { entry: Entry; index: number }[] }[] {
  const groups: { group: string; items: { entry: Entry; index: number }[] }[] = [];
  entries.forEach((entry, index) => {
    const last = groups[groups.length - 1];
    if (last && last.group === entry.group) last.items.push({ entry, index });
    else groups.push({ group: entry.group, items: [{ entry, index }] });
  });
  return groups;
}

/** 在文本里高亮第一处匹配 */
function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-amber-400/35 text-inherit">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

function Row({
  id,
  active,
  onHover,
  onRun,
  icon: Icon,
  children,
  trailing,
}: {
  id: string;
  active: boolean;
  onHover: () => void;
  onRun: () => void;
  icon: LucideIcon;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onRun}
      className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors', active && 'bg-accent-soft')}
    >
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset transition-colors',
          active ? 'bg-surface text-accent-text ring-accent/30' : 'bg-surface-2 text-fg-subtle ring-line',
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {trailing}
      {active && <CornerDownLeft aria-hidden="true" className="size-3.5 shrink-0 text-fg-subtle" />}
    </div>
  );
}

export type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  notes: readonly NoteSummary[];
  inCount: InCount;
  commands: readonly PaletteCommand[];
  onOpenNote: (noteId: string) => void;
  /** 在决策清单里查看全部匹配项 */
  onShowAll: (query: string) => void;
};

function PaletteDialog({ onClose, notes, inCount, commands, onOpenNote, onShowAll }: Omit<CommandPaletteProps, 'open'>) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const entries = useMemo(() => buildEntries(query, notes, commands), [query, notes, commands]);
  const groups = useMemo(() => groupEntries(entries), [entries]);
  const activeIndex = Math.min(active, entries.length - 1);
  const optionId = (index: number) => `${uid}-opt-${index}`;

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, entries]);

  const run = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    if (entry.kind === 'note') onOpenNote(entry.note.id);
    else if (entry.kind === 'all') onShowAll(query.trim());
    else entry.command.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 输入法组合中（拼音上屏、翻候选）不当作快捷键
    const count = entries.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (count) setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % count : i <= 0 ? count - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(entries[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); // 同时挡住 window 上的 Esc 监听（详情抽屉），只关面板
      onClose();
    }
  };

  // 点在输入框以外的地方（标题、空隙、页脚）不能把焦点从输入框上夺走，否则方向键 / 回车 / Esc 就失灵了
  const keepInputFocus = (e: MouseEvent) => {
    if (e.target !== inputRef.current) e.preventDefault();
  };

  return (
    <Modal label="命令面板" onClose={onClose} align="top" className="w-[min(92vw,40rem)]">
      <div onKeyDown={onKeyDown} onMouseDown={keepInputFocus}>
        <div role="status" className="sr-only">
          {entries.length ? `${entries.length} 项结果` : '无匹配结果'}
        </div>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
          <input
            ref={inputRef}
            data-autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls={`${uid}-list`}
            aria-activedescendant={entries.length ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            aria-label="搜索决策或输入命令"
            autoComplete="off"
            spellCheck={false}
            placeholder="搜索决策，或输入命令…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-hidden placeholder:text-fg-subtle"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div
          ref={listRef}
          id={`${uid}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label="结果"
          className="max-h-[min(26rem,60vh)] overflow-y-auto p-2 outline-hidden"
        >
          {entries.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-fg-subtle">
              未找到与「<span className="font-medium text-fg-muted">{query.trim()}</span>」匹配的决策或命令
            </div>
          )}
          {groups.map(({ group, items }, groupIndex) => (
            <div key={group} role="group" aria-labelledby={`${uid}-group-${groupIndex}`}>
              <div
                id={`${uid}-group-${groupIndex}`}
                className="px-2.5 pt-2.5 pb-1 text-2xs font-bold tracking-[0.08em] text-fg-subtle uppercase"
              >
                {group}
              </div>
              {items.map(({ entry, index }) => {
                const common = {
                  id: optionId(index),
                  active: index === activeIndex,
                  onHover: () => setActive(index),
                  onRun: () => run(entry),
                };
                if (entry.kind === 'note') {
                  const count = cites(inCount, entry.note.id);
                  return (
                    <Row
                      key={entry.key}
                      {...common}
                      icon={FileText}
                      trailing={
                        count > 0 && (
                          <span title="被引用次数" className="tabular inline-flex items-center gap-0.5 text-2xs font-bold text-accent-text">
                            <ArrowUpRight aria-hidden="true" className="size-3" />
                            <span aria-hidden="true">{count}</span>
                            <span className="sr-only">被引用 {count} 次</span>
                          </span>
                        )
                      }
                    >
                      <div className="truncate text-[13.5px] font-semibold text-fg">
                        <Highlight text={entry.note.title} query={query} />
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-2">
                        <ClassBadge cls={entry.note.cls} />
                        <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{entry.note.date || '进行中'}</span>
                        <span className="truncate font-mono text-[11px] text-fg-subtle">#{entry.note.slug}</span>
                      </div>
                    </Row>
                  );
                }
                if (entry.kind === 'all') {
                  return (
                    <Row key={entry.key} {...common} icon={ListFilter}>
                      <div className="text-[13.5px] font-medium text-fg">
                        在决策清单中查看全部 <span className="tabular font-bold">{entry.total}</span> 条匹配
                      </div>
                    </Row>
                  );
                }
                return (
                  <Row
                    key={entry.key}
                    {...common}
                    icon={entry.command.icon}
                    trailing={entry.command.hint && <span className="text-xs text-fg-subtle">{entry.command.hint}</span>}
                  >
                    <div className="truncate text-[13.5px] font-medium text-fg">
                      <Highlight text={entry.command.label} query={query} />
                    </div>
                  </Row>
                );
              })}
            </div>
          ))}
        </div>

        <footer className="flex items-center gap-4 border-t border-line px-4 py-2 text-2xs text-fg-subtle">
          <span className="inline-flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            选择
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            打开
          </span>
          <span className="ml-auto">决策搜索范围：当前项目</span>
        </footer>
      </div>
    </Modal>
  );
}

/** ⌘K 命令面板：搜索当前项目的决策，也能跳转视图、切换项目、执行常用操作。每次打开都是全新状态。 */
export function CommandPalette({ open, ...rest }: CommandPaletteProps) {
  return open ? <PaletteDialog {...rest} /> : null;
}
