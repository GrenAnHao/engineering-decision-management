import { useEffect, useRef, useState } from 'react';
import type { NoteDoc, NoteSummary } from '../../shared/types';
import { api } from '../api';
import { cites, findNote, type InCount } from '../derive';
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
  { key: 'problem', title: '🎯 01. 背景与痛点', empty: '（未独立分节说明问题）' },
  { key: 'decision', title: '⚡ 02. 落地裁定事实', empty: '（未记录具体裁定事实）' },
  { key: 'alternatives', title: '🚫 03. 审慎考虑并放弃的备选', empty: '（无曾考虑的备选对比）' },
  { key: 'consequences', title: '⚖️ 04. 收益与工程代价', empty: '（未详述工程后果）' },
] as const;

function CopyAnchor({ id }: { id: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
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
  return (
    <div className="anchor-terminal">
      <span className="anchor-code">{anchor}</span>
      <button type="button" className="btn-anchor-copy" onClick={copy}>
        {state === 'copied' ? '已复制' : state === 'failed' ? '复制失败' : '复制反向代码注释'}
      </button>
    </div>
  );
}

function DrawerBody({ doc, notes, inCount, onOpenNote }: { doc: NoteDoc; notes: readonly NoteSummary[]; inCount: InCount; onOpenNote: (id: string) => void }) {
  const citeCount = cites(inCount, doc.id);
  return (
    <>
      <CopyAnchor id={doc.id} />
      <h1 className="console-headline" id="note-drawer-title">{doc.title}</h1>
      <div className="console-timestamp">
        <span>{doc.date || '无日期'}</span>
        <span>·</span>
        <span>{doc.slug}</span>
        {citeCount > 0 && (
          <>
            <span>·</span>
            <span className="console-cites">被引用 {citeCount} 次</span>
          </>
        )}
      </div>
      {doc.verdict && (
        <div className="verdict-banner">
          <span className="verdict-label">否决 / 状态说明</span>
          <MarkdownBody source={doc.verdict} links={doc.links} onOpenNote={onOpenNote} inline />
        </div>
      )}
      {QUADS.map((q) => (
        <div className="quad-section" key={q.key}>
          <div className="quad-title">{q.title}</div>
          {doc[q.key] ? (
            <MarkdownBody source={doc[q.key]} links={doc.links} onOpenNote={onOpenNote} />
          ) : (
            <div className="md-body quad-placeholder">{q.empty}</div>
          )}
        </div>
      ))}
      {doc.extraSections.map((s, i) => (
        <div className="quad-section" key={`${s.heading}-${i}`}>
          <div className="quad-title">📎 {s.heading}</div>
          <MarkdownBody source={s.body} links={doc.links} onOpenNote={onOpenNote} />
        </div>
      ))}
      <div className="quad-section">
        <div className="quad-title">🔗 05. 因果与血缘依赖链路</div>
        <LineageChips note={doc} notes={notes} onOpenNote={onOpenNote} />
      </div>
    </>
  );
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
  const closeRef = useRef<HTMLButtonElement>(null);
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

  // 对话框焦点管理：打开时聚焦关闭按钮，卸载时还给打开前的元素
  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    return () => (prev as HTMLElement | null)?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 搜索框已用 Esc 关了自己的浮层（defaultPrevented）或正在输入法组合时，不关抽屉
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stale = !!(summary && snapshot && summary.hash !== snapshot.hash);
  const deleted = !!(notes && !summary && snapshot);
  const missing = !!(notes && !noteId && !snapshot);

  return (
    <>
      <div className="drawer-curtain" onClick={onClose} />
      <aside className="drawer-console" role="dialog" aria-modal="true" aria-label="笔记详情" aria-labelledby="note-drawer-title">
        <div className="console-header">
          {snapshot && <StatusBadge lifecycle={snapshot.lifecycle} />}
          {snapshot && <ClassBadge cls={snapshot.cls} />}
          <button type="button" className="console-exit" ref={closeRef} title="退出 (Esc)" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="console-body">
          {stale && (
            <div className="update-banner">
              <span>此笔记已更新</span>
              <button type="button" onClick={() => setReloadTick((t) => t + 1)}>
                点击刷新
              </button>
            </div>
          )}
          {deleted && (
            <div className="update-banner deleted">
              <span>此笔记已被删除或移动，以下为删除前的内容</span>
            </div>
          )}
          {error && (
            <div className="update-banner deleted">
              <span>加载失败：{error}</span>
              <button type="button" onClick={() => setReloadTick((t) => t + 1)}>
                重试
              </button>
            </div>
          )}
          {missing && <div className="empty-hint">// 未找到笔记：{noteKey}</div>}
          {!snapshot && !missing && !error && <div className="skeleton-block tall" />}
          {snapshot && <DrawerBody doc={snapshot} notes={notes ?? []} inCount={inCount} onOpenNote={onOpenNote} />}
        </div>
      </aside>
    </>
  );
}
