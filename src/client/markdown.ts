// 轻量 Markdown → AST。只覆盖笔记里实际用到的语法：段落、标题、（嵌套）列表、表格、引用、围栏代码、行内代码、粗体、链接、反斜杠转义。
// 渲染交给 MarkdownBody.tsx 生成 React 元素，不拼 HTML 字符串；链接是否渲染为真正的 <a> 由渲染层按协议白名单决定。

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] };

export type ListItem = { c: Inline[]; children: Block[] };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'ul'; items: ListItem[] }
  | { t: 'ol'; items: ListItem[] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'pre'; lang: string; v: string }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

// 各分支都有长度上限，避免超长单行触发二次方回溯
const INLINE_RE =
  /(\\[\\`*_[\]()#>|-])|(`[^`\n]{1,2000}`)|(\*\*(?:\\.|[^*\n\\]){1,500}?\*\*)|(\[[^\]\n]{0,500}\]\([^)\s]{1,2000}(?:\s+"[^"\n]{0,500}")?\))/g;
const LINK_PARTS_RE = /^\[([^\]\n]*)\]\(([^)\s]+)/;
// 反引号围栏的 info string 不能含反引号（CommonMark），否则 ```x``` 这类行内代码会被误判为围栏
const FENCE_RE = /^ {0,3}(?:(`{3,})([^`]*)|(~{3,})(.*))$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const ITEM_RE = /^( *)([-*+]|\d+[.)])\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const pushText = (v: string) => {
    const prev = out[out.length - 1];
    if (prev?.t === 'text') prev.v += v;
    else out.push({ t: 'text', v });
  };
  for (const m of src.matchAll(INLINE_RE)) {
    if (m.index! > last) pushText(src.slice(last, m.index));
    const token = m[0];
    if (m[1]) pushText(token.slice(1));
    else if (m[2]) out.push({ t: 'code', v: token.slice(1, -1) });
    else if (m[3]) out.push({ t: 'strong', c: parseInline(token.slice(2, -2)) });
    else {
      const parts = LINK_PARTS_RE.exec(token)!;
      out.push({ t: 'link', href: parts[2]!, c: parseInline(parts[1]!) });
    }
    last = m.index! + token.length;
  }
  if (last < src.length) pushText(src.slice(last));
  return out;
}

function splitRow(line: string): Inline[][] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => parseInline(cell.trim()));
}

function leadingSpaces(line: string): number {
  return line.length - line.trimStart().length;
}

// 列表嵌套递归的深度上限，超过后子内容按段落处理，防止病态深嵌套超线性耗时
const MAX_DEPTH = 8;

type ListKind = 'ul' | 'ol';
type PendingList = { kind: ListKind; indent: number; items: { text: string; sub: string[] }[] };

export function parseBlocks(md: string, depth = 0): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: PendingList | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join('\n')) });
    para = [];
  };
  const flushList = () => {
    if (list) {
      blocks.push({
        t: list.kind,
        items: list.items.map((it) => ({
          c: parseInline(it.text),
          children: it.sub.length
            ? depth < MAX_DEPTH
              ? parseBlocks(it.sub.join('\n'), depth + 1)
              : [{ t: 'p', c: parseInline(it.sub.join('\n')) }]
            : [],
        })),
      });
    }
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
    const item = ITEM_RE.exec(line);

    // 列表进行中：比当前列表更深的缩进行归属最后一项（子列表、子段落或续行）
    if (list && line.trim() && leadingSpaces(line) > 0) {
      const current: PendingList = list;
      const deeper = item ? item[1]!.length > current.indent : true;
      if (deeper) {
        const last = current.items[current.items.length - 1]!;
        const opensBlock = !!item || FENCE_RE.test(line.trimStart());
        if (opensBlock || last.sub.length) last.sub.push(line.slice(Math.min(leadingSpaces(line), current.indent + 2)));
        else last.text += `\n${line.trim()}`;
        continue;
      }
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      flushAll();
      const marker = (fence[1] ?? fence[3])!;
      const lang = (fence[2] ?? fence[4] ?? '').trim().split(/\s+/)[0] ?? '';
      const body: string[] = [];
      for (i += 1; i < lines.length; i += 1) {
        const closing = lines[i]!.trim();
        if (closing.startsWith(marker[0]!.repeat(marker.length)) && /^(`+|~+)$/.test(closing)) break;
        body.push(lines[i]!);
      }
      blocks.push({ t: 'pre', lang, v: body.join('\n') });
      continue;
    }
    if (!line.trim()) {
      flushAll();
      continue;
    }
    if (line.trimStart().startsWith('|') && TABLE_SEP_RE.test(lines[i + 1] ?? '')) {
      flushAll();
      const head = splitRow(line);
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && lines[i]!.trimStart().startsWith('|'); i += 1) rows.push(splitRow(lines[i]!));
      i -= 1;
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushAll();
      blocks.push({ t: 'h', level: heading[1]!.length, c: parseInline(heading[2]!.trim()) });
      continue;
    }
    if (item) {
      const kind: ListKind = /\d/.test(item[2]![0]!) ? 'ol' : 'ul';
      flushPara();
      flushQuote();
      if (list && (list as PendingList).kind !== kind) flushList();
      list ??= { kind, indent: item[1]!.length, items: [] };
      list.items.push({ text: item[3]!, sub: [] });
      continue;
    }
    const q = QUOTE_RE.exec(line);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1]!);
      continue;
    }
    flushList();
    flushQuote();
    para.push(line);
  }
  flushAll();
  return blocks;
}
