import { expect, test } from 'bun:test';
import { CLASSES, LIFECYCLES } from '../../src/shared/types';
import { classTone, STATUS_LABELS, STATUS_TONES } from '../../src/client/labels';

test('每个生命周期都有标签与色系', () => {
  for (const lifecycle of LIFECYCLES) {
    expect(STATUS_LABELS[lifecycle]).toBeTruthy();
    expect(STATUS_TONES[lifecycle]).toBeTruthy();
  }
});

test('固定的六个分类各有专属色系；未知分类回落为中性灰', () => {
  const tones = CLASSES.map(classTone);
  expect(new Set(tones).size).toBe(CLASSES.length);
  expect(tones).not.toContain('neutral');
  expect(classTone('something-new')).toBe('neutral');
});
