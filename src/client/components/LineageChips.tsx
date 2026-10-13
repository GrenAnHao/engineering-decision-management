import { ArrowDownRight, ArrowUpLeft, ArrowUpRight, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LinkResult, NoteDoc, NoteSummary } from '../../shared/types';
import { incoming } from '../derive';
import { tv } from '../ui/tw';

/** 胶囊：可跳转的引用是实线按钮；外部引用（虚线）与断链（玫红）只是说明，不可点 */
const chip = tv({
  base: 'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-3 text-xs [&_svg]:size-3.5 [&_svg]:shrink-0',
  variants: {
    kind: {
      link: 'bg-surface font-medium text-fg ring-1 ring-line-strong ring-inset transition-colors hover:bg-accent-soft hover:text-accent-text hover:ring-accent/40',
      external: 'cursor-default border border-dashed border-line-strong font-mono text-fg-muted',
      broken:
        'cursor-default bg-rose-500/10 font-mono text-rose-700 ring-1 ring-rose-600/20 ring-inset dark:text-rose-300 dark:ring-rose-400/25',
    },
  },
});

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-fg-muted">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function LinkChip({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" className={chip({ kind: 'link' })} onClick={onClick}>
      <Icon aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** 不可点击的说明胶囊：完整的原始 href 放在 title 里 */
function NoteChip({ kind, icon: Icon, label, href }: { kind: 'external' | 'broken'; icon: LucideIcon; label: string; href: string }) {
  return (
    <span className={chip({ kind })} title={href}>
      <Icon aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function LineageChips({
  note,
  notes,
  onOpenNote,
}: {
  note: NoteDoc;
  notes: readonly NoteSummary[];
  onOpenNote: (noteId: string) => void;
}) {
  const titleOf = (id: string) => notes.find((n) => n.id === id)?.title ?? id;
  const outgoing = note.links
    .filter((l): l is Extract<LinkResult, { kind: 'resolved' }> => l.kind === 'resolved')
    .filter((l, i, all) => all.findIndex((x) => x.targetId === l.targetId) === i);
  const external = note.links.filter((l) => l.kind === 'external');
  const broken = note.links.filter((l) => l.kind === 'unresolved');
  const inbound = incoming(notes, note.id);

  if (!outgoing.length && !external.length && !broken.length && !inbound.length) {
    return <p className="text-[13px] text-fg-subtle">独立节点，暂无交叉引用</p>;
  }

  return (
    <div className="space-y-4">
      {outgoing.length > 0 && (
        <Group title="前置先决依据：">
          {outgoing.map((l) => (
            <LinkChip key={l.rawHref} icon={ArrowUpLeft} label={titleOf(l.targetId)} onClick={() => onOpenNote(l.targetId)} />
          ))}
        </Group>
      )}
      {inbound.length > 0 && (
        <Group title="派生制约影响：">
          {inbound.map((n) => (
            <LinkChip key={n.id} icon={ArrowDownRight} label={n.title} onClick={() => onOpenNote(n.id)} />
          ))}
        </Group>
      )}
      {external.length > 0 && (
        <Group title="外部引用（notes 目录之外）：">
          {external.map((l) => (
            <NoteChip key={l.rawHref} kind="external" icon={ArrowUpRight} label={`外部引用 · ${l.rawHref}`} href={l.rawHref} />
          ))}
        </Group>
      )}
      {broken.length > 0 && (
        <Group title="断链（目标笔记不存在）：">
          {broken.map((l) => (
            <NoteChip key={l.rawHref} kind="broken" icon={TriangleAlert} label={`断链 · ${l.rawHref}`} href={l.rawHref} />
          ))}
        </Group>
      )}
    </div>
  );
}
