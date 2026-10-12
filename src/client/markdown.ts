// 轻量 Markdown → AST。只覆盖笔记里实际用到的语法：段落、###~###### 标题、列表、引用、围栏代码、行内代码、粗体、链接。
// 渲染交给 MarkdownBody.tsx 生成 React 元素，不拼 HTML 字符串，天然防注入。

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'pre'; lang: string; v: string };

const INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\[[^\]\n]*\]\([^)\s]+(?:\s+"[^"\n]*")?\))/g;
const LINK_PARTS_RE = /^\[([^\]\n]*)\]\(([^)\s]+)/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([\w-]*)/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE_RE)) {
    if (m.index! > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    const token = m[0];
    if (m[1]) out.push({ t: 'code', v: token.slice(1, -1) });
    else if (m[2]) out.push({ t: 'strong', c: parseInline(token.slice(2, -2)) });
    else {
      const parts = LINK_PARTS_RE.exec(token)!;
      out.push({ t: 'link', href: parts[2]!, c: parseInline(parts[1]!) });
    }
    last = m.index! + token.length;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}

type ListKind = 'ul' | 'ol';

export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: { kind: ListKind; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join('\n')) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: list.kind, items: list.items.map(parseInline) });
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ t: 'quote', c: parseInline(quote.join('\n')) });
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const fence = FENCE_RE.exec(line);
    if (fence) {
      flushAll();
      const marker = fence[1]!;
      const body: string[] = [];
      for (i += 1; i < lines.length; i += 1) {
        const closing = lines[i]!.trim();
        if (closing.startsWith(marker[0]!.repeat(marker.length)) && /^(`+|~+)$/.test(closing)) break;
        body.push(lines[i]!);
      }
      blocks.push({ t: 'pre', lang: fence[2] ?? '', v: body.join('\n') });
      continue;
    }
    if (!line.trim()) {
      flushAll();
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushAll();
      blocks.push({ t: 'h', level: heading[1]!.length, c: parseInline(heading[2]!.trim()) });
      continue;
    }
    const ul = UL_RE.exec(line);
    const ol = ul ? null : OL_RE.exec(line);
    if (ul || ol) {
      const kind: ListKind = ul ? 'ul' : 'ol';
      flushPara();
      flushQuote();
      if (list && list.kind !== kind) flushList();
      list ??= { kind, items: [] };
      list.items.push((ul ?? ol)![1]!);
      continue;
    }
    const q = QUOTE_RE.exec(line);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1]!);
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1] += `\n${line.trim()}`;
      continue;
    }
    flushList();
    flushQuote();
    para.push(line);
  }
  flushAll();
  return blocks;
}
