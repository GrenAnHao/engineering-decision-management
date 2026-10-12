import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LIFECYCLES } from '../../src/shared/types';
import { notesDir, scanNotes } from '../../src/server/scan';
import { computeInCount } from '../../src/server/store';

// 本机真实数据；数据在实时变动，只断言结构性条件。目录不存在时整组跳过。
const PROJECTS_ROOT = process.env.EDM_REAL_ROOT ?? 'D:\\OneDrive\\Project Files';
const REAL = ['Pi', 'gren-ssh', 'electron-mall-manager']
  .map((name) => join(PROJECTS_ROOT, name))
  .filter((p) => existsSync(notesDir(p)));

describe.if(REAL.length > 0)('真实笔记目录', () => {
  for (const project of REAL) {
    test(`${project}：每篇都有 id/lifecycle/title，lifecycle 合法，引用图谱项目内封闭`, async () => {
      const { notes, scanMs } = await scanNotes(notesDir(project));
      expect(notes.length).toBeGreaterThan(0);
      const ids = new Set(notes.map((n) => n.id));
      for (const n of notes) {
        expect(n.id).toMatch(/^(implemented|proposed|rejected|archived)\/[^/]+\/.+\.md$/);
        expect(LIFECYCLES).toContain(n.lifecycle);
        expect(n.title.length).toBeGreaterThan(0);
        expect(n.decision.length).toBeGreaterThan(0);
        for (const link of n.links) {
          if (link.kind === 'resolved') expect(ids.has(link.targetId)).toBe(true);
        }
      }
      for (const target of computeInCount(notes).keys()) expect(ids.has(target)).toBe(true);
      expect(scanMs).toBeLessThan(2000);
    });
  }

  test('rejected 笔记都带 verdict', async () => {
    for (const project of REAL) {
      const { notes } = await scanNotes(notesDir(project));
      for (const n of notes.filter((x) => x.lifecycle === 'rejected')) expect(n.verdict.length).toBeGreaterThan(0);
    }
  });
});
