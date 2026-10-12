import { useMemo, type ReactNode } from 'react';
import type { LinkResult } from '../../shared/types';
import { parseBlocks, parseInline, type Block, type Inline } from '../markdown';

type LinkContext = { links: readonly LinkResult[]; onOpenNote: (noteId: string) => void };

function renderLink(href: string, children: ReactNode, key: number, ctx: LinkContext): ReactNode {
  const result = ctx.links.find((l) => l.rawHref === href);
  if (result?.kind === 'resolved') {
    return (
      <button key={key} type="button" className="md-link" onClick={() => ctx.onOpenNote(result.targetId)}>
        {children}
      </button>
    );
  }
  if (result?.kind === 'external') {
    return (
      <span key={key} className="md-link external" title={`↗ 外部引用：${href}`}>
        {children} <span aria-hidden="true">↗</span>
        <span className="sr-only">（外部引用）</span>
      </span>
    );
  }
  if (result?.kind === 'unresolved') {
    return (
      <span key={key} className="md-link broken" title={`⚠ 断链：${href}`}>
        {children}
        <span className="sr-only">（断链）</span>
      </span>
    );
  }
  if (/^https?:\/\//i.test(href)) {
    return (
      <a key={key} className="md-link" href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return <span key={key}>{children}</span>;
}

function renderInline(nodes: readonly Inline[], ctx: LinkContext): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.t) {
      case 'text': {
        const lines = node.v.split('\n');
        return lines.flatMap((line, j) => (j === 0 ? [line] : [<br key={`${i}-${j}`} />, line]));
      }
      case 'code':
        return <code key={i}>{node.v}</code>;
      case 'strong':
        return <b key={i}>{renderInline(node.c, ctx)}</b>;
      case 'link':
        return renderLink(node.href, renderInline(node.c, ctx), i, ctx);
    }
  });
}

function renderBlock(block: Block, i: number, ctx: LinkContext): ReactNode {
  switch (block.t) {
    case 'p':
      return <p key={i}>{renderInline(block.c, ctx)}</p>;
    case 'h': {
      // 抽屉里已有 h1 与章节标题，正文标题从 h3 起
      const Tag = `h${Math.min(Math.max(block.level, 3), 6)}` as 'h3' | 'h4' | 'h5' | 'h6';
      return <Tag key={i}>{renderInline(block.c, ctx)}</Tag>;
    }
    case 'ul':
    case 'ol': {
      const Tag = block.t;
      return (
        <Tag key={i}>
          {block.items.map((item, j) => (
            <li key={j}>
              {renderInline(item.c, ctx)}
              {item.children.map((child, k) => renderBlock(child, k, ctx))}
            </li>
          ))}
        </Tag>
      );
    }
    case 'table':
      return (
        <table key={i}>
          <thead>
            <tr>
              {block.head.map((cell, j) => (
                <th key={j}>{renderInline(cell, ctx)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, j) => (
                  <td key={j}>{renderInline(cell, ctx)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'quote':
      return <blockquote key={i}>{renderInline(block.c, ctx)}</blockquote>;
    case 'pre':
      return (
        <pre key={i}>
          <code>{block.v}</code>
        </pre>
      );
  }
}

export type MarkdownBodyProps = {
  source: string;
  links: readonly LinkResult[];
  onOpenNote: (noteId: string) => void;
  /** 单行模式：只解析行内语法（用于 verdict） */
  inline?: boolean;
};

export function MarkdownBody({ source, links, onOpenNote, inline = false }: MarkdownBodyProps) {
  const ctx = { links, onOpenNote };
  const blocks = useMemo(() => (inline ? null : parseBlocks(source)), [source, inline]);
  if (inline) return <span className="md-body">{renderInline(parseInline(source), ctx)}</span>;
  return <div className="md-body">{blocks!.map((b, i) => renderBlock(b, i, ctx))}</div>;
}
