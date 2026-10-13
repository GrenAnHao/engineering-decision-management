import { expect, test } from 'bun:test';
import { addHighlights, snapshotUnread } from '../../src/client/notifications/highlight';
import type { AppNotification } from '../../src/client/notifications/types';

const n = (id: string, read: boolean): AppNotification => ({
  id,
  projectId: 'P',
  projectName: '项目 P',
  projectOrder: 0,
  at: 0,
  read,
  body: { type: 'recovered' },
});

test('snapshotUnread 只拍下未读的 id', () => {
  expect([...snapshotUnread([n('a', false), n('b', true), n('c', false)])]).toEqual(['a', 'c']);
  expect(snapshotUnread([n('a', true)]).size).toBe(0);
});

test('addHighlights 并入新 id，返回新集合且不改入参', () => {
  const base: ReadonlySet<string> = new Set(['a']);
  const next = addHighlights(base, ['b', 'a', 'b']);
  expect([...next]).toEqual(['a', 'b']);
  expect([...base]).toEqual(['a']);
});

test('addHighlights 没有新增时原样返回同一个集合', () => {
  const base: ReadonlySet<string> = new Set(['a']);
  expect(addHighlights(base, ['a'])).toBe(base);
  expect(addHighlights(base, [])).toBe(base);
});
