import { expect, test } from 'bun:test';
import { clockTime, dayGroup } from '../../src/client/format';

const at = (month: number, day: number, h: number, m: number) => new Date(2026, month - 1, day, h, m).getTime();
const NOW = at(10, 12, 15, 0);

test('今天只显示时分，其他日子带月日', () => {
  expect(clockTime(at(10, 12, 9, 5), NOW)).toBe('09:05');
  expect(clockTime(at(10, 11, 23, 59), NOW)).toBe('10月11日 23:59');
  expect(clockTime(at(1, 3, 0, 0), NOW)).toBe('1月3日 00:00');
});

test('按自然日分为 今天 / 昨天 / 更早', () => {
  expect(dayGroup(at(10, 12, 0, 0), NOW)).toBe('今天');
  expect(dayGroup(at(10, 11, 23, 59), NOW)).toBe('昨天');
  expect(dayGroup(at(10, 11, 0, 0), NOW)).toBe('昨天');
  expect(dayGroup(at(10, 10, 23, 59), NOW)).toBe('更早');
});
