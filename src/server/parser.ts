import { isLifecycle, type Lifecycle, type NoteDoc, type Section } from '../shared/types';

/** 解析阶段产出的原始链接，等全项目 id 集合就绪后再由 links.ts 解析成三态 */
export type RawLink = { href: string; path: string; anchor: string };

export type ParsedNote = Omit<NoteDoc, 'links'> & { rawLinks: RawLink[] };

type FixedKey = 'problem' | 'decision' | 'alternatives' | 'consequences';

const SECTION_ALIASES: Record<FixedKey, readonly string[]> = {
  problem: ['problem', '问题'],
  decision: ['decision', 'proposal', '决策', '提案'],
  alternatives: ['alternatives considered', '曾考虑的替代方案', '曾考虑的备选'],
  consequences: ['consequences', '后果'],
};

const HEADING_RE = /^## +(.+?)[ \t]*$/gm;
const TITLE_RE = /^# Agent Note[^:：\n]*[:：][ \t]*(.+?)[ \t]*$/m;
const ANY_H1_RE = /^# +(.+?)[ \t]*$/m;
const STATUS_RE = /^Status:[ \t]*([A-Za-z-]+)[ \t]*(?:[—–-][ \t]*(.*?))?[ \t]*$/m;
const LINK_RE = /\[[^\]\n]*\]\(([^)\s]+)(?:[ \t]+"[^"\n]*")?\)/g;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const FENCE_OPEN_RE = /^ {0,3}(?:(`{3,})[^`]*|(~{3,}).*)$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

export function normalizeNewlines(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/**
 * 把围栏代码块（含围栏行）的字符替换为空格、保留换行，偏移量与原文一一对应。
 * 结构识别（## 标题、Status 行、.md 链接）只在遮罩文本上做，正文切片仍取原文，代码块得以保留。
 */
export function maskFences(text: string): string {
  let fence: string | null = null;
  return text
    .split('\n')
    .map((line) => {
      if (fence === null) {
        const open = FENCE_OPEN_RE.exec(line);
        if (!open) return line;
        fence = (open[1] ?? open[2])!;
        return ' '.repeat(line.length);
      }
      const close = FENCE_CLOSE_RE.exec(line);
      if (close && close[1]![0] === fence[0] && close[1]!.length >= fence.length) fence = null;
      return ' '.repeat(line.length);
    })
    .join('\n');
}

/**
 * 按 `## ` 标题切分章节：每节正文止于下一个 `## ` 标题或字符串结尾。
 * 等价于设计文档 §4.2 的 `(?=^## |(?![\s\S]))` 语义，且不依赖 JS 不支持的 `\Z`，
 * 同时保留 `###` 子节（它们不匹配 `^## +`）。
 */
export function splitSections(text: string, masked: string): Section[] {
  const heads = [...masked.matchAll(HEADING_RE)].map((m) => ({
    heading: m[1]!.trim(),
    start: m.index!,
    bodyStart: m.index! + m[0].length,
  }));
  return heads.map((h, i) => ({
    heading: h.heading,
    body: text.slice(h.bodyStart, heads[i + 1]?.start ?? text.length).trim(),
  }));
}

function fixedKeyOf(heading: string): FixedKey | null {
  const lower = heading.toLowerCase();
  for (const key of Object.keys(SECTION_ALIASES) as FixedKey[]) {
    if (SECTION_ALIASES[key].includes(lower)) return key;
  }
  return null;
}

export function extractRawLinks(masked: string): RawLink[] {
  const links: RawLink[] = [];
  for (const m of masked.matchAll(LINK_RE)) {
    const href = m[1]!;
    if (SCHEME_RE.test(href)) continue;
    const hashAt = href.indexOf('#');
    const rawPath = hashAt === -1 ? href : href.slice(0, hashAt);
    const anchor = hashAt === -1 ? '' : href.slice(hashAt + 1);
    if (!/\.md$/i.test(rawPath)) continue;
    let path = rawPath;
    try {
      path = decodeURI(rawPath);
    } catch {
      // 非法百分号编码时按原样使用
    }
    links.push({ href, path, anchor });
  }
  return links;
}

/** 单篇笔记 → 结构化文档。id 为相对 notes 根、以 / 分隔的路径（.zh.md 已归一化为 .md）。 */
export function parseNote(raw: string, id: string): ParsedNote {
  const text = normalizeNewlines(raw);
  const masked = maskFences(text);
  const parts = id.split('/');
  const folderLifecycle = parts[0] as Lifecycle;
  const cls = parts[1] ?? '';
  const slug = (parts[parts.length - 1] ?? id).replace(/\.md$/i, '');
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(slug)?.[1] ?? '';

  const title = TITLE_RE.exec(masked)?.[1] ?? ANY_H1_RE.exec(masked)?.[1] ?? slug;

  const firstHeading = masked.search(/^## /m);
  const status = STATUS_RE.exec(firstHeading === -1 ? masked : masked.slice(0, firstHeading));
  const statusWord = status?.[1]?.toLowerCase() ?? '';
  const lifecycle: Lifecycle = isLifecycle(statusWord) ? statusWord : folderLifecycle;
  const verdict = status?.[2]?.trim() ?? '';

  const fixed: Record<FixedKey, string> = { problem: '', decision: '', alternatives: '', consequences: '' };
  const seen = new Set<FixedKey>();
  const extraSections: Section[] = [];
  for (const section of splitSections(text, masked)) {
    const key = fixedKeyOf(section.heading);
    if (key && !seen.has(key)) {
      seen.add(key);
      fixed[key] = section.body;
    } else {
      extraSections.push(section);
    }
  }

  return {
    id,
    slug,
    lifecycle,
    cls,
    date,
    title,
    verdict,
    ...fixed,
    extraSections,
    rawLinks: extractRawLinks(masked),
    hash: Bun.hash(text).toString(16),
    rawBody: text,
  };
}
