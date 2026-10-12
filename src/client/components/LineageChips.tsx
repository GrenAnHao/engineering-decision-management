import type { LinkResult, NoteDoc, NoteSummary } from '../../shared/types';
import { incoming } from '../derive';

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
    return <span className="lineage-empty">独立节点，暂无交叉引用</span>;
  }

  return (
    <div className="lineage-nodes">
      {outgoing.length > 0 && (
        <div>
          <div className="lineage-group-title">前置先决依据：</div>
          <div className="lineage-chips">
            {outgoing.map((l) => (
              <button key={l.rawHref} type="button" className="lineage-chip" onClick={() => onOpenNote(l.targetId)}>
                ↖ {titleOf(l.targetId)}
              </button>
            ))}
          </div>
        </div>
      )}
      {inbound.length > 0 && (
        <div>
          <div className="lineage-group-title">派生制约影响：</div>
          <div className="lineage-chips">
            {inbound.map((n) => (
              <button key={n.id} type="button" className="lineage-chip" onClick={() => onOpenNote(n.id)}>
                ↘ {n.title}
              </button>
            ))}
          </div>
        </div>
      )}
      {external.length > 0 && (
        <div>
          <div className="lineage-group-title">外部引用（notes 目录之外）：</div>
          <div className="lineage-chips">
            {external.map((l) => (
              <span key={l.rawHref} className="lineage-chip external" title={l.rawHref}>
                ↗ 外部引用 · {l.rawHref}
              </span>
            ))}
          </div>
        </div>
      )}
      {broken.length > 0 && (
        <div>
          <div className="lineage-group-title">断链（目标笔记不存在）：</div>
          <div className="lineage-chips">
            {broken.map((l) => (
              <span key={l.rawHref} className="lineage-chip broken" title={l.rawHref}>
                ⚠ 断链 · {l.rawHref}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
