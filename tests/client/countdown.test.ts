import { expect, test } from 'bun:test';
import { createCountdown } from '../../src/client/notifications/countdown';

test('不暂停时按时间递减，6 秒到期', () => {
  const c = createCountdown(6000, 1000);
  expect(c.remaining(1000)).toBe(6000);
  expect(c.remaining(3500)).toBe(3500);
  expect(c.remaining(7000)).toBe(0);
});

test('暂停期间不计时，恢复后按剩余时间继续', () => {
  const c = createCountdown(6000, 0);
  c.pause(2000);
  expect(c.remaining(2000)).toBe(4000);
  expect(c.remaining(50_000)).toBe(4000);
  c.resume(50_000);
  expect(c.remaining(51_000)).toBe(3000);
  expect(c.remaining(54_000)).toBe(0);
});

test('多次暂停和恢复累计正确；重复 pause / resume 无副作用', () => {
  const c = createCountdown(6000, 0);
  c.pause(1000); // 剩 5000
  c.pause(9000);
  c.resume(10_000);
  c.resume(10_500);
  c.pause(12_000); // 又用了 2000，剩 3000
  c.resume(20_000);
  expect(c.remaining(20_000)).toBe(3000);
  expect(c.remaining(21_000)).toBe(2000);
});

test('剩余时间不会小于 0，包括暂停时已超时的情况', () => {
  const c = createCountdown(6000, 0);
  expect(c.remaining(99_999)).toBe(0);
  c.pause(99_999);
  expect(c.remaining(100_000)).toBe(0);
  c.resume(100_000);
  expect(c.remaining(200_000)).toBe(0);
});
