import type { LinkResult } from '../shared/types';
import type { RawLink } from './parser';

export type LinkIndex = { ids: ReadonlySet<string>; bySlug: ReadonlyMap<string, string> };

const ZH_MD_RE = /\.zh\.md$/i;

function slugOf(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}

/** ids 需按稳定顺序传入：slug 冲突时先到者胜出 */
export function buildLinkIndex(ids: readonly string[]): LinkIndex {
  const bySlug = new Map<string, string>();
  for (const id of ids) {
    const slug = slugOf(id);
    if (!bySlug.has(slug)) bySlug.set(slug, id);
  }
  return { ids: new Set(ids), bySlug };
}

/** 以 base 目录段为起点归一化相对路径；越过 notes 根（或以 / 开头）返回 null */
export function normalizeRelative(baseDir: readonly string[], rel: string): string | null {
  if (rel.startsWith('/')) return null;
  const out = [...baseDir];
  for (const seg of rel.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join('/');
}

export function resolveLink(fromId: string, link: RawLink, index: LinkIndex): LinkResult {
  const { href: rawHref, anchor } = link;
  const target = normalizeRelative(fromId.split('/').slice(0, -1), link.path);
  if (target === null) return { kind: 'external', rawHref, anchor };
  const id = target.replace(ZH_MD_RE, '.md');
  if (index.ids.has(id)) return { kind: 'resolved', targetId: id, rawHref, anchor };
  const bySlug = index.bySlug.get(slugOf(id));
  if (bySlug) return { kind: 'resolved', targetId: bySlug, rawHref, anchor };
  return { kind: 'unresolved', rawHref, anchor };
}

/** 解析一篇笔记的全部链接：按 rawHref 去重，丢弃指向自身的链接 */
export function resolveLinks(fromId: string, rawLinks: readonly RawLink[], index: LinkIndex): LinkResult[] {
  const seen = new Set<string>();
  const out: LinkResult[] = [];
  for (const link of rawLinks) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    const result = resolveLink(fromId, link, index);
    if (result.kind === 'resolved' && result.targetId === fromId) continue;
    out.push(result);
  }
  return out;
}
