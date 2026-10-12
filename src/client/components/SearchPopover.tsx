import { useEffect, useRef, useState } from 'react';
import type { NoteSummary } from '../../shared/types';
import { cites, searchNotes, type InCount } from '../derive';
import { ClassBadge } from './Badge';

export type SearchBoxProps = {
  notes: readonly NoteSummary[];
  inCount: InCount;
  query: string;
  onQueryChange: (q: string) => void;
  onOpenNote: (noteId: string) => void;
  /** 回车且未选中条目：去决策清单查看全部匹配 */
  onShowAll: () => void;
};

/** 顶栏全局搜索：/ 聚焦，↑↓ 选择，↵ 打开，Esc 关闭，浮层显示前 7 条 */
export function SearchBox({ notes, inCount, query, onQueryChange, onOpenNote, onShowAll }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const { total, top } = searchNotes(notes, query);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || document.activeElement === inputRef.current) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const pick = (noteId: string) => {
    onOpenNote(noteId);
    setOpen(false);
  };

  useEffect(() => {
    boxRef.current?.querySelector('.popover-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected, open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 输入法组合中（拼音上屏、翻候选）不当作快捷键
    const key = e.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const n = top.length;
      if (!n) return;
      setSelected((i) => (key === 'ArrowDown' ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (key === 'Enter') {
      e.preventDefault();
      const hit = open ? top[selected] : undefined;
      if (hit) pick(hit.id);
      else {
        onShowAll();
        setOpen(false);
      }
    } else if (key === 'Escape' && open) {
      e.preventDefault(); // 浮层打开时 Esc 只关浮层；已关闭时放行，让 Esc 继续去关抽屉
      setOpen(false);
      setSelected(-1);
    }
  };

  return (
    <div className="hud-search" ref={boxRef}>
      <svg className="search-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        placeholder="快速搜索决策与避坑..."
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setSelected(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <span className="shortcut-key">/</span>
      {open && query.trim() && (
        <div className="search-popover">
          {top.length === 0 ? (
            <div className="popover-empty">// 未找到与 "{query}" 匹配的决策记录</div>
          ) : (
            <>
              {top.map((n, i) => (
                <div
                  key={n.id}
                  className={`popover-item${i === selected ? ' selected' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(n.id)}
                >
                  <div className="popover-item-main">
                    <div className="popover-title">{n.title}</div>
                    <div className="popover-sub">
                      <ClassBadge cls={n.cls} />
                      <span>{n.date || '进行中'}</span>
                      <span>#{n.slug}</span>
                    </div>
                  </div>
                  {cites(inCount, n.id) > 0 && <span className="weight-gauge">↗{cites(inCount, n.id)}</span>}
                </div>
              ))}
              <div className="popover-footer">
                <span>
                  共找到 <b>{total}</b> 项决策
                </span>
                <span>按 ↵ 回车在全量清单中查看全部</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
