import { describe, expect, test } from 'bun:test';
import { formatHash, normalizeRoute, parseHash } from '../../src/client/router';
import { plainText, relativeTime } from '../../src/client/format';

describe('router', () => {
  test('解析 #项目/视图/note=笔记', () => {
    expect(parseHash('#Pi/baseline/note=2026-10-11-subagent-redesign')).toEqual({
      projectId: 'Pi',
      view: 'baseline',
      note: '2026-10-11-subagent-redesign',
    });
  });

  test('format 与 parse 往返，项目名与笔记 id 中的特殊字符被编码', () => {
    const route = { projectId: '项目 A', view: 'timeline' as const, note: 'implemented/feature/x.md' };
    const hash = formatHash(route);
    expect(hash).toBe('#%E9%A1%B9%E7%9B%AE%20A/timeline/note=implemented%2Ffeature%2Fx.md');
    expect(normalizeRoute(parseHash(hash), ['项目 A'], ['项目 A'])).toEqual(route);
  });

  test('未编码的笔记路径也能解析', () => {
    expect(parseHash('#Pi/directory/note=implemented/feature/x.md').note).toBe('implemented/feature/x.md');
  });

  test('非法项目回落首个可见项目，非法视图回落 baseline', () => {
    expect(normalizeRoute(parseHash('#Nope/whatever'), ['Pi', 'gren'], ['gren', 'Pi'])).toEqual({
      projectId: 'gren',
      view: 'baseline',
      note: null,
    });
  });

  test('隐藏项目可通过 hash 直达', () => {
    expect(normalizeRoute(parseHash('#Hidden/timeline'), ['Pi', 'Hidden'], ['Pi'])?.projectId).toBe('Hidden');
  });

  test('兼容旧看板 #note=<id> 与 #<视图>', () => {
    expect(normalizeRoute(parseHash('#note=implemented%2Fa%2Fb.md'), ['Pi'], ['Pi'])).toEqual({
      projectId: 'Pi',
      view: 'baseline',
      note: 'implemented/a/b.md',
    });
    expect(normalizeRoute(parseHash('#timeline'), ['Pi'], ['Pi'])?.view).toBe('timeline');
  });

  test('没有项目时返回 null；空 hash 回落首个项目', () => {
    expect(normalizeRoute(parseHash(''), [], [])).toBeNull();
    expect(normalizeRoute(parseHash(''), ['Pi'], ['Pi'])).toEqual({ projectId: 'Pi', view: 'baseline', note: null });
  });
});

describe('format', () => {
  const now = Date.parse('2026-10-12T12:00:00');
  test('relativeTime 分档', () => {
    expect(relativeTime(0, now)).toBe('—');
    expect(relativeTime(now - 10_000, now)).toBe('刚刚');
    expect(relativeTime(now - 12 * 60_000, now)).toBe('12m 前');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h 前');
    expect(relativeTime(now - 30 * 3_600_000, now)).toBe('昨天');
    expect(relativeTime(now - 5 * 86_400_000, now)).toBe('5 天前');
    expect(relativeTime(Date.parse('2026-01-02T08:00:00'), now)).toBe('2026-01-02');
  });

  test('plainText 去掉 Markdown 标记', () => {
    expect(plainText('### 标题\n- **粗体** 与 `code`\n见 [链接](./a.md)\n```\n代码\n```')).toBe('标题 粗体 与 code 见 链接');
  });
});
