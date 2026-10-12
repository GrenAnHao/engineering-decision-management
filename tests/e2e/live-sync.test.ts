import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigResponse, NotesResponse, ProjectUpdatedEvent } from '../../src/shared/types';
import { makeProject, note } from '../helpers/fixture';
import { startTestServer, waitForEvent, type TestEnv } from '../helpers/server';

let env: TestEnv | null = null;
afterEach(() => {
  env?.close();
  env = null;
});

async function openEvents(base: string): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const res = await fetch(`${base}/api/events`);
  expect(res.headers.get('content-type')).toStartWith('text/event-stream');
  const reader = res.body!.getReader();
  await waitForEvent(reader, (event) => event === 'connected');
  return reader;
}

test('写入笔记 → SSE 收到 project-updated → 条数变化；删除后再次减少', async () => {
  env = await startTestServer((root) => makeProject(root, 'Live', { 'implemented/feature/2026-01-01-a.md': note('a') }));
  const notesRoot = join(env.root, 'Live', '.agents', 'notes');
  const reader = await openEvents(env.base);

  mkdirSync(join(notesRoot, 'proposed', 'architecture'), { recursive: true });
  writeFileSync(join(notesRoot, 'proposed', 'architecture', '2026-10-12-new.md'), note('新提案', 'proposed'));

  const added = await waitForEvent(reader, (event, data) => event === 'project-updated' && (data as ProjectUpdatedEvent).count === 2);
  expect((added.data as ProjectUpdatedEvent).delta).toBe(1);
  expect((added.data as ProjectUpdatedEvent).project.counts.proposed).toBe(1);

  const list = (await (await fetch(`${env.base}/api/projects/Live/notes`)).json()) as NotesResponse;
  expect(list.notes.map((n) => n.slug)).toContain('2026-10-12-new');

  rmSync(join(notesRoot, 'proposed', 'architecture', '2026-10-12-new.md'));
  const removed = await waitForEvent(reader, (event, data) => event === 'project-updated' && (data as ProjectUpdatedEvent).count === 1);
  expect((removed.data as ProjectUpdatedEvent).delta).toBe(-1);
  await reader.cancel();
});

test('文件事件触发的扫描更新 lastChangeAt', async () => {
  env = await startTestServer((root) => makeProject(root, 'Live', { 'implemented/feature/2026-01-01-a.md': note('a') }));
  const reader = await openEvents(env.base);
  const before = Date.now();
  writeFileSync(join(env.root, 'Live', '.agents', 'notes', 'implemented', 'feature', '2026-01-01-a.md'), note('a 改'));
  const { data } = await waitForEvent(reader, (event) => event === 'project-updated');
  expect((data as ProjectUpdatedEvent).project.lastChangeAt).toBeGreaterThanOrEqual(before);
  await reader.cancel();
});

test('定期重扫扫描根发现新项目并广播 config-changed', async () => {
  env = await startTestServer((root) => makeProject(root, 'First', {}));
  const reader = await openEvents(env.base);
  makeProject(env.root, 'Second', { 'implemented/feature/2026-01-01-b.md': note('b') });
  await env.hub.refreshRoots();
  const { data } = await waitForEvent(reader, (event) => event === 'config-changed');
  expect((data as { projects: { id: string }[] }).projects.map((p) => p.id).sort()).toEqual(['First', 'Second']);
  const config = (await (await fetch(`${env.base}/api/config`)).json()) as ConfigResponse;
  expect(config.projects.find((p) => p.id === 'Second')!.count).toBe(1);
  await reader.cancel();
});
