import { describe, expect, test } from 'bun:test';
import { buildLinkIndex, normalizeRelative, resolveLink, resolveLinks } from '../../src/server/links';
import type { RawLink } from '../../src/server/parser';

const FROM = 'rejected/architecture/2026-10-11-out-of-process.md';
const INDEX = buildLinkIndex([
  'implemented/architecture/2026-10-11-subagent-redesign.md',
  'rejected/feature/2026-10-12-approvals.md',
  'rejected/architecture/2026-10-10-job-guard.md',
  'implemented/feature/2026-09-01-moved.md',
  FROM,
]);

function link(href: string): RawLink {
  const [path, anchor = ''] = href.split('#') as [string, string?];
  return { href, path, anchor };
}

describe('resolveLink', () => {
  test('../../implemented/architecture/xxx.md → resolved', () => {
    expect(resolveLink(FROM, link('../../implemented/architecture/2026-10-11-subagent-redesign.md'), INDEX)).toEqual({
      kind: 'resolved',
      targetId: 'implemented/architecture/2026-10-11-subagent-redesign.md',
      rawHref: '../../implemented/architecture/2026-10-11-subagent-redesign.md',
      anchor: '',
    });
  });

  test('../feature/xxx.md（同生命周期跨分类）→ resolved', () => {
    const r = resolveLink(FROM, link('../feature/2026-10-12-approvals.md'), INDEX);
    expect(r.kind).toBe('resolved');
    expect(r.kind === 'resolved' && r.targetId).toBe('rejected/feature/2026-10-12-approvals.md');
  });

  test('同目录裸文件名 → resolved', () => {
    const r = resolveLink(FROM, link('2026-10-10-job-guard.md'), INDEX);
    expect(r.kind === 'resolved' && r.targetId).toBe('rejected/architecture/2026-10-10-job-guard.md');
  });

  test('../../../../docs/decisions/xxx.md → external', () => {
    expect(resolveLink(FROM, link('../../../../docs/decisions/x/2026-10-10-a.md'), INDEX).kind).toBe('external');
  });

  test('以 / 开头的仓库绝对路径 → external', () => {
    expect(resolveLink(FROM, link('/docs/architecture.md'), INDEX).kind).toBe('external');
  });

  test('./nonexistent.md → unresolved', () => {
    expect(resolveLink(FROM, link('./nonexistent.md'), INDEX)).toEqual({
      kind: 'unresolved',
      rawHref: './nonexistent.md',
      anchor: '',
    });
  });

  test('链接带 #anchor 后缀：anchor 被剥离，targetId 正确', () => {
    const r = resolveLink(FROM, link('../../implemented/architecture/2026-10-11-subagent-redesign.md#决策'), INDEX);
    expect(r).toEqual({
      kind: 'resolved',
      targetId: 'implemented/architecture/2026-10-11-subagent-redesign.md',
      rawHref: '../../implemented/architecture/2026-10-11-subagent-redesign.md#决策',
      anchor: '决策',
    });
  });

  test('路径未命中时按 slug 回退（笔记被挪了目录）', () => {
    const r = resolveLink(FROM, link('../../proposed/feature/2026-09-01-moved.md'), INDEX);
    expect(r.kind === 'resolved' && r.targetId).toBe('implemented/feature/2026-09-01-moved.md');
  });

  test('.zh.md 链接归一化为 .md', () => {
    const r = resolveLink(FROM, link('2026-10-10-job-guard.zh.md'), INDEX);
    expect(r.kind === 'resolved' && r.targetId).toBe('rejected/architecture/2026-10-10-job-guard.md');
  });
});

describe('resolveLinks', () => {
  test('按 rawHref 去重并丢弃自引用', () => {
    const out = resolveLinks(
      FROM,
      [link('./2026-10-10-job-guard.md'), link('./2026-10-10-job-guard.md'), link('./2026-10-11-out-of-process.md')],
      INDEX,
    );
    expect(out).toHaveLength(1);
  });
});

describe('normalizeRelative', () => {
  test('处理 ./ 与 ../', () => {
    expect(normalizeRelative(['a', 'b'], './c/../d.md')).toBe('a/b/d.md');
    expect(normalizeRelative(['a'], '../../x.md')).toBeNull();
  });
});
