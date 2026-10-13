import { ChevronDown, X } from 'lucide-react';
import { useId, useState, type CSSProperties } from 'react';
import type { NoteChange } from '../../shared/types';
import { clockTime } from '../format';
import { CHANGE_TONES, projectColor } from '../labels';
import { changeLabel, notificationText, remainderText } from '../notifications/derive';
import type { AppNotification } from '../notifications/types';
import { Badge } from '../ui/Badge';
import { cn } from '../ui/tw';

/** 卡片默认列出的变更行数 */
export const PREVIEW_ROWS = 3;

export type NotificationCardProps = {
  notification: AppNotification;
  /** toast：右上角弹出（倒计时、只列前几处）；drawer：抽屉里（可展开全部、显示未读与时刻） */
  variant: 'toast' | 'drawer';
  onOpenProject: (notification: AppNotification) => void;
  onOpenNote: (notification: AppNotification, noteId: string) => void;
  /** toast 里是「收起」，drawer 里是「清除」 */
  onDismiss: (id: string) => void;
  /** 仅 toast：倒计时是否暂停（鼠标停留 / 焦点在卡片内） */
  paused?: boolean;
  /** 仅 drawer：计算「今天 14:32 / 10月11日 14:32」用的当前时间 */
  now?: number;
};

function ChangeRow({ change, onOpen }: { change: NoteChange; onOpen: () => void }) {
  const label = <Badge tone={CHANGE_TONES[change.kind]}>{changeLabel(change)}</Badge>;
  if (change.kind === 'removed') {
    return (
      <div className="flex items-center gap-2 px-1.5 py-1">
        {label}
        <span className="truncate text-fg-subtle line-through">{change.title}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2"
    >
      {label}
      <span className="truncate text-fg">{change.title}</span>
    </button>
  );
}

function StatusRow({ tone, label, text }: { tone: 'amber' | 'emerald'; label: string; text: string }) {
  return (
    <div className="flex items-start gap-2 px-1.5 py-1">
      <Badge tone={tone} className="mt-px">
        {label}
      </Badge>
      <span className="min-w-0 leading-relaxed break-words text-fg-muted">{text}</span>
    </div>
  );
}

function headerMeta(n: AppNotification, variant: NotificationCardProps['variant'], now: number): string {
  const count = n.body.type === 'changes' ? n.body.changes.length : 0;
  if (variant === 'toast') return count > 0 ? `${count} 处变更 · 刚刚` : '刚刚';
  const time = clockTime(n.at, now);
  return count > 0 ? `${count} 处 · ${time}` : time;
}

/** 通知卡片：左侧项目色条 + 淡项目色页眉（项目色走 CSS 变量，属于设计规范允许的动态值） */
export function NotificationCard({ notification: n, variant, onOpenProject, onOpenNote, onDismiss, paused = false, now = Date.now() }: NotificationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const changes = n.body.type === 'changes' ? n.body.changes : [];
  const visible = variant === 'drawer' && expanded ? changes : changes.slice(0, PREVIEW_ROWS);
  const remainder = variant === 'toast' ? remainderText(changes, PREVIEW_ROWS) : null;
  const canExpand = variant === 'drawer' && changes.length > PREVIEW_ROWS;

  return (
    <article
      aria-label={`${n.projectName}：${notificationText(n)}`}
      style={{ '--project': projectColor(n.projectOrder) } as CSSProperties}
      className={cn('relative overflow-hidden rounded-xl bg-surface text-[13px] ring-1 ring-line', variant === 'toast' ? 'shadow-pop' : 'shadow-card')}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-(--project)" />
      <header className="flex items-center gap-2 border-b border-line bg-[color-mix(in_srgb,var(--project)_7%,var(--surface))] py-1.5 pr-1.5 pl-4">
        <button
          type="button"
          onClick={() => onOpenProject(n)}
          className="min-w-0 truncate font-semibold text-fg underline-offset-2 hover:underline"
        >
          {n.projectName}
        </button>
        {variant === 'drawer' && !n.read && <Badge tone="blue">新</Badge>}
        <span className="tabular ml-auto shrink-0 font-mono text-2xs text-fg-subtle">{headerMeta(n, variant, now)}</span>
        <button
          type="button"
          aria-label={variant === 'toast' ? `收起：${n.projectName}` : `清除通知：${n.projectName}`}
          title={variant === 'toast' ? '收起' : '清除'}
          onClick={() => onDismiss(n.id)}
          className="grid size-6 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </header>

      <div className="py-1.5 pr-2 pl-3">
        {n.body.type === 'error' && <StatusRow tone="amber" label="异常" text={n.body.reason} />}
        {n.body.type === 'recovered' && <StatusRow tone="emerald" label="已恢复" text="实时监听已恢复" />}
        <div id={listId}>
          {visible.map((c) => (
            <ChangeRow key={`${c.kind}:${c.id}`} change={c} onOpen={() => onOpenNote(n, c.id)} />
          ))}
        </div>
        {remainder && <p className="px-1.5 pt-0.5 pb-1 text-xs text-fg-subtle">{remainder}</p>}
        {canExpand && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-accent-text transition-colors hover:bg-accent-soft"
          >
            {expanded ? '收起' : `展开全部 ${changes.length} 处`}
            <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
        )}
      </div>

      {variant === 'toast' && (
        <span
          aria-hidden="true"
          className={cn('absolute inset-x-0 bottom-0 h-0.5 origin-left animate-toast-timer bg-(--project)/60 motion-reduce:hidden', paused && '[animation-play-state:paused]')}
        />
      )}
    </article>
  );
}
