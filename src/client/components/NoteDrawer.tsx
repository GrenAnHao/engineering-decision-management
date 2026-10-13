import {
  Ban,
  Check,
  Copy,
  FileQuestionMark,
  FileX,
  Link2,
  Paperclip,
  RefreshCw,
  Scale,
  Target,
  TriangleAlert,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { NoteDoc, NoteSummary } from '../../shared/types';
import { api } from '../api';
import { cites, findNote, type InCount } from '../derive';
import { Banner, BannerButton } from '../ui/Banner';
import { Button } from '../ui/Button';
import { EmptyState, Skeleton } from '../ui/State';
import { cn } from '../ui/tw';
import { ClassBadge, StatusBadge } from './Badge';
import { LineageChips } from './LineageChips';
import { MarkdownBody } from './MarkdownBody';

export type NoteDrawerProps = {
  projectId: string;
  /** 路由里的笔记键：id 或 slug */
  noteKey: string;
  /** 当前项目的最新笔记列表；null 表示尚未加载 */
  notes: readonly NoteSummary[] | null;
  inCount: InCount;
  onClose: () => void;
  onOpenNote: (noteId: string) => void;
};

const QUADS = [
  { key: 'problem', icon: Target, title: '01. 背景与痛点', empty: '（未独立分节说明问题）' },
  { key: 'decision', icon: Zap, title: '02. 落地裁定事实', empty: '（未记录具体裁定事实）' },
  { key: 'alternatives', icon: Ban, title: '03. 审慎考虑并放弃的备选', empty: '（无曾考虑的备选对比）' },
  { key: 'consequences', icon: Scale, title: '04. 收益与工程代价', empty: '（未详述工程后果）' },
] as const;

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_UI: Record<CopyState, { icon: LucideIcon; label: string }> = {
  idle: { icon: Copy, label: '复制反向代码注释' },
  copied: { icon: Check, label: '已复制' },
  failed: { icon: TriangleAlert, label: '复制失败' },
};

/** 反向代码注释条：把「// Note: 见 …」复制到剪贴板，贴进代码里指回这篇笔记 */
function CopyAnchor({ id }: { id: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = `// Note: 见 .agents/notes/${id}`;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(anchor);
      setState('copied');
    } catch (err) {
      console.error('[drawer] 复制失败', err);
      setState('failed');
    }
    timer.current = setTimeout(() => setState('idle'), 1500);
  };
  const { icon: Icon, label } = COPY_UI[state];
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-1 pl-3.5 ring-1 ring-line">
      <code title={anchor} className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-accent-text">
        {anchor}
      </code>
      <Button size="sm" className="rounded-md" onClick={copy}>
        <Icon aria-hidden="true" />
        {label}
      </Button>
    </div>
  );
}

function NoteTitle({ doc, citeCount }: { doc: NoteDoc; citeCount: number }) {
  return (
    <div>
      <h1 id="note-drawer-title" className="font-display text-2xl leading-snug font-bold tracking-tight break-words text-fg">
        {doc.title}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-fg-subtle">
        <span className="tabular">{doc.date || '无日期'}</span>
        <span aria-hidden="true">·</span>
        <span className="break-all">{doc.slug}</span>
        {citeCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className="tabular font-bold text-accent-text">被引用 {citeCount} 次</span>
          </>
        )}
      </div>
    </div>
  );
}

/** 否决 / 状态说明：玫红底 + 左侧色条的提示块 */
function Verdict({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg py-3 pr-4 pl-5 text-[13.5px] leading-relaxed',
        'bg-rose-500/10 text-rose-800 ring-1 ring-rose-600/20 ring-inset dark:text-rose-200 dark:ring-rose-400/25',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-rose-500',
      )}
    >
      <span className="mb-1 block font-mono text-[11px] font-bold tracking-wide text-rose-700 dark:text-rose-300">否决 / 状态说明</span>
      {children}
    </div>
  );
}

/** 章节块：图标 + 等宽大写标题，右侧一条发丝线填满整行 */
function DrawerSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-mono text-xs font-bold tracking-[0.08em] text-fg-muted uppercase after:ml-1 after:h-px after:flex-1 after:bg-line">
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-accent-text" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Placeholder({ children }: { children: string }) {
  return <p className="text-[13px] text-fg-subtle">{children}</p>;
}

type DrawerBodyProps = { doc: NoteDoc; notes: readonly NoteSummary[]; inCount: InCount; onOpenNote: (id: string) => void };

function DrawerBody({ doc, notes, inCount, onOpenNote }: DrawerBodyProps) {
  const markdown = (source: string, inline = false) => (
    <MarkdownBody source={source} links={doc.links} onOpenNote={onOpenNote} inline={inline} />
  );
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <NoteTitle doc={doc} citeCount={cites(inCount, doc.id)} />
        <CopyAnchor id={doc.id} />
        {doc.verdict && <Verdict>{markdown(doc.verdict, true)}</Verdict>}
      </div>
      {QUADS.map((q) => (
        <DrawerSection key={q.key} icon={q.icon} title={q.title}>
          {doc[q.key] ? markdown(doc[q.key]) : <Placeholder>{q.empty}</Placeholder>}
        </DrawerSection>
      ))}
      {doc.extraSections.map((s, i) => (
        <DrawerSection key={`${s.heading}-${i}`} icon={Paperclip} title={s.heading}>
          {markdown(s.body)}
        </DrawerSection>
      ))}
      <DrawerSection icon={Link2} title="05. 因果与血缘依赖链路">
        <LineageChips note={doc} notes={notes} onOpenNote={onOpenNote} />
      </DrawerSection>
    </div>
  );
}

/** 正文到达前的占位：标题、元信息、复制条与几段内容 */
function DrawerSkeleton() {
  return (
    <div role="status" className="space-y-8">
      <span className="sr-only">正在加载笔记…</span>
      <div className="space-y-4">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-11" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-20" />
        </div>
      ))}
    </div>
  );
}

type NoticesProps = { stale: boolean; deleted: boolean; error: string | null; onReload: () => void };

/** 正文上方的提示条：已更新 / 已删除 / 加载失败 */
function Notices({ stale, deleted, error, onReload }: NoticesProps) {
  if (!stale && !deleted && !error) return null;
  return (
    <div className="space-y-3">
      {stale && (
        <Banner tone="amber" icon={RefreshCw} action={<BannerButton onClick={onReload}>点击刷新</BannerButton>}>
          此笔记已更新
        </Banner>
      )}
      {deleted && (
        <Banner tone="rose" icon={FileX}>
          此笔记已被删除或移动，以下为删除前的内容
        </Banner>
      )}
      {error && (
        <Banner tone="rose" icon={TriangleAlert} action={<BannerButton onClick={onReload}>重试</BannerButton>}>
          加载失败：{error}
        </Banner>
      )}
    </div>
  );
}

/** 打开时拉取一次完整内容作为快照；reload 重新拉取。参数变化或卸载后丢弃迟到的响应 */
function useNoteSnapshot(projectId: string, noteId: string | null) {
  const [snapshot, setSnapshot] = useState<NoteDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    api
      .note(projectId, noteId)
      .then((res) => {
        if (cancelled) return;
        setSnapshot(res.note);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, noteId, reloadTick]);

  return { snapshot, error, reload: () => setReloadTick((t) => t + 1) };
}

/** 对话框焦点管理：打开时聚焦关闭按钮，卸载时还给打开前的元素 */
function useDialogFocus() {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    return () => (prev as HTMLElement | null)?.focus?.();
  }, []);
  return closeRef;
}

/**
 * Esc 关闭抽屉。命令面板已用 Esc 关了自己（defaultPrevented）、正在输入法组合、
 * 或头上还压着一个打开的模态框（添加 / 重命名 / 确认对话框）时，都不关抽屉：一次 Esc 只关最上面那一层。
 */
function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      if (document.querySelector('dialog[open]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** aria-modal 的抽屉要把 Tab 困在里面：到末尾回到开头，到开头 Shift+Tab 回到末尾，焦点不会漏到被遮住的页面上 */
function useFocusTrap() {
  const ref = useRef<HTMLElement>(null);
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return { ref, onKeyDown };
}

/**
 * 详情抽屉。打开时拉取一次完整内容作为快照；之后笔记被改动不自动替换正文，
 * 而是浮出「此笔记已更新 · 点击刷新」，由用户决定何时刷新。父组件以 noteKey 作 key，换篇即重置。
 */
export function NoteDrawer({ projectId, noteKey, notes, inCount, onClose, onOpenNote }: NoteDrawerProps) {
  // 锁定首次解析出的笔记 id：同 id 重现或 slug 重名时不会静默换成别的正文
  const lockedId = useRef<string | null>(null);
  const resolved = notes ? findNote(notes, noteKey) : undefined;
  if (lockedId.current === null && resolved) lockedId.current = resolved.id;
  const noteId = lockedId.current;
  const summary = noteId && notes ? notes.find((n) => n.id === noteId) : undefined;
  const { snapshot, error, reload } = useNoteSnapshot(projectId, noteId);
  const closeRef = useDialogFocus();
  const trap = useFocusTrap();
  useEscapeClose(onClose);

  const stale = !!(summary && snapshot && summary.hash !== snapshot.hash);
  const deleted = !!(notes && !summary && snapshot);
  const missing = !!(notes && !noteId && !snapshot);

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-50 animate-fade-in bg-(--backdrop) backdrop-blur-[2px]" onClick={onClose} />
      <aside
        ref={trap.ref}
        onKeyDown={trap.onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="笔记详情"
        aria-labelledby="note-drawer-title"
        className="fixed inset-y-0 right-0 z-[51] flex w-[min(100vw,52rem)] animate-slide-in-right flex-col bg-surface shadow-pop ring-1 ring-line-strong"
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-5 backdrop-blur sm:px-10">
          {snapshot && <StatusBadge lifecycle={snapshot.lifecycle} />}
          {snapshot && <ClassBadge cls={snapshot.cls} />}
          <Button ref={closeRef} variant="ghost" size="icon" className="-mr-2 ml-auto" title="退出 (Esc)" aria-label="关闭" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-10 sm:py-8">
          <div className="space-y-6">
            <Notices stale={stale} deleted={deleted} error={error} onReload={reload} />
            {missing && (
              <EmptyState compact icon={FileQuestionMark} title={`未找到笔记：${noteKey}`}>
                它可能已被删除或移动，或链接有误。
              </EmptyState>
            )}
            {!snapshot && !missing && !error && <DrawerSkeleton />}
            {snapshot && <DrawerBody doc={snapshot} notes={notes ?? []} inCount={inCount} onOpenNote={onOpenNote} />}
          </div>
        </div>
      </aside>
    </>
  );
}
