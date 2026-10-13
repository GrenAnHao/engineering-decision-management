import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigResponse, NotesResponse, ProjectErrorEvent, ProjectUpdatedEvent } from '../../src/shared/types';
import { makeProject, note } from '../helpers/fixture';
import { closeAllTestServers, startTestServer, useServerTestTimeout, waitForEvent, type TestEnv } from '../helpers/server';

useServerTestTimeout();

let env: TestEnv | null = null;
afterEach(() => {
  env?.close();
  closeAllTestServers();
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
  expect((added.data as ProjectUpdatedEvent).changes).toEqual([
    { kind: 'added', id: 'proposed/architecture/2026-10-12-new.md', title: '新提案', lifecycle: 'proposed' },
  ]);

  const list = (await (await fetch(`${env.base}/api/projects/Live/notes`)).json()) as NotesResponse;
  expect(list.notes.map((n) => n.slug)).toContain('2026-10-12-new');

  rmSync(join(notesRoot, 'proposed', 'architecture', '2026-10-12-new.md'));
  const removed = await waitForEvent(reader, (event, data) => event === 'project-updated' && (data as ProjectUpdatedEvent).count === 1);
  expect((removed.data as ProjectUpdatedEvent).delta).toBe(-1);
  expect((removed.data as ProjectUpdatedEvent).changes).toEqual([
    { kind: 'removed', id: 'proposed/architecture/2026-10-12-new.md', title: '新提案', lifecycle: 'proposed' },
  ]);
  await reader.cancel();
});

test('文件事件触发的扫描更新 lastChangeAt', async () => {
  env = await startTestServer((root) => makeProject(root, 'Live', { 'implemented/feature/2026-01-01-a.md': note('a') }));
  const reader = await openEvents(env.base);
  const before = Date.now();
  writeFileSync(join(env.root, 'Live', '.agents', 'notes', 'implemented', 'feature', '2026-01-01-a.md'), note('a 改'));
  const { data } = await waitForEvent(reader, (event) => event === 'project-updated');
  expect((data as ProjectUpdatedEvent).project.lastChangeAt).toBeGreaterThanOrEqual(before);
  expect((data as ProjectUpdatedEvent).changes).toEqual([
    { kind: 'modified', id: 'implemented/feature/2026-01-01-a.md', title: 'a 改', lifecycle: 'implemented' },
  ]);
  await reader.cancel();
});

test('定期重扫扫描根发现新项目并广播 config-changed', async () => {
  env = await startTestServer((root) => makeProject(root, 'First', {}), {
    watch: { debounceMs: 50, rescanRootsMs: 1000 },
  });
  const reader = await openEvents(env.base);
  makeProject(env.root, 'Second', { 'implemented/feature/2026-01-01-b.md': note('b') });
  // 同一次读取里可能连着到达 project-updated 与 config-changed，所以在一次等待内顺带记下前者
  let initial: ProjectUpdatedEvent | undefined;
  const { data } = await waitForEvent(
    reader,
    (event, d) => {
      if (event === 'project-updated' && (d as ProjectUpdatedEvent).id === 'Second') initial = d as ProjectUpdatedEvent;
      return event === 'config-changed';
    },
    4000,
  );
  expect(initial).toBeDefined();
  expect(initial!.changes).toBeUndefined();
  expect((data as { projects: { id: string }[] }).projects.map((p) => p.id).sort()).toEqual(['First', 'Second']);
  const config = (await (await fetch(`${env.base}/api/config`)).json()) as ConfigResponse;
  expect(config.projects.find((p) => p.id === 'Second')!.count).toBe(1);
  await reader.cancel();
});

test('notes 目录被删后项目变为失效 + 手动刷新；恢复后的手动重扫不带 changes', async () => {
  env = await startTestServer((root) => makeProject(root, 'Gone', { 'implemented/feature/2026-01-01-a.md': note('a') }));
  const reader = await openEvents(env.base);
  const before = Date.now();
  rmSync(join(env.root, 'Gone', '.agents', 'notes'), { recursive: true, force: true });
  const error = await waitForEvent(reader, (event, data) => event === 'project-error' && (data as { id: string }).id === 'Gone', 5000);
  expect((error.data as ProjectErrorEvent).at).toBeGreaterThanOrEqual(before);
  const config = (await (await fetch(`${env.base}/api/config`)).json()) as ConfigResponse;
  expect(config.projects.find((p) => p.id === 'Gone')).toMatchObject({ healthy: false, watchMode: 'manual', count: 0 });

  makeProject(env.root, 'Gone', { 'implemented/feature/2026-01-01-a.md': note('a') });
  await fetch(`${env.base}/api/projects/Gone/rescan`, { method: 'POST' });
  const recovered = await waitForEvent(
    reader,
    (event, data) => event === 'project-updated' && (data as ProjectUpdatedEvent).id === 'Gone',
    5000,
  );
  expect((recovered.data as ProjectUpdatedEvent).project).toMatchObject({ healthy: true, watchMode: 'live', count: 1 });
  expect((recovered.data as ProjectUpdatedEvent).changes).toBeUndefined();
  await reader.cancel();
});

test('启动后没有真实改动时 lastChangeAt 仍取笔记日期（不被初始扫描误记为文件事件）', async () => {
  env = await startTestServer((root) => makeProject(root, 'Calm', { 'implemented/feature/2026-01-01-a.md': note('a') }));
  await Bun.sleep(1200);
  const config = (await (await fetch(`${env.base}/api/config`)).json()) as ConfigResponse;
  expect(config.projects.find((p) => p.id === 'Calm')!.lastChangeAt).toBe(Date.parse('2026-01-01T00:00:00'));
});

test('notes 目录被替换后自动在新目录上恢复实时监听', async () => {
  env = await startTestServer((root) => makeProject(root, 'Swap', { 'implemented/feature/2026-01-01-a.md': note('a') }));
  const notesRoot = join(env.root, 'Swap', '.agents', 'notes');
  const reader = await openEvents(env.base);
  rmSync(notesRoot, { recursive: true, force: true });
  mkdirSync(join(notesRoot, 'implemented', 'feature'), { recursive: true });
  writeFileSync(join(notesRoot, 'implemented', 'feature', '2026-02-02-b.md'), note('b'));
  await waitForEvent(
    reader,
    (event, data) =>
      event === 'project-updated' &&
      (data as ProjectUpdatedEvent).project.counts.implemented === 1 &&
      (data as ProjectUpdatedEvent).id === 'Swap' &&
      (data as ProjectUpdatedEvent).count === 1,
    8000,
  );
  await Bun.sleep(1500);
  writeFileSync(join(notesRoot, 'implemented', 'feature', '2026-02-03-c.md'), note('c'));
  await waitForEvent(reader, (event, data) => event === 'project-updated' && (data as ProjectUpdatedEvent).count === 2, 5000);
  const config = (await (await fetch(`${env.base}/api/config`)).json()) as ConfigResponse;
  expect(config.projects.find((p) => p.id === 'Swap')).toMatchObject({ healthy: true, watchMode: 'live', count: 2 });
  await reader.cancel();
});

test('把笔记从 proposed 移到 implemented → changes 里是一条 moved', async () => {
  env = await startTestServer((root) =>
    makeProject(root, 'Move', { 'proposed/feature/2026-01-01-a.md': note('a', 'proposed'), 'implemented/feature/.keep.md': '' }),
  );
  const notesRoot = join(env.root, 'Move', '.agents', 'notes');
  const reader = await openEvents(env.base);
  // 等启动时补的那次 file 重扫跑完，否则它可能在 rename 过程中途遍历目录，看到新旧两处同时存在
  await Bun.sleep(300);
  // 笔记的生命周期取自 Status 行（缺省才用目录），真实的迁移是「换目录 + 改 Status」，两步同步完成后才会触发扫描
  const target = join(notesRoot, 'implemented', 'feature', '2026-01-01-a.md');
  renameSync(join(notesRoot, 'proposed', 'feature', '2026-01-01-a.md'), target);
  writeFileSync(target, note('a', 'implemented'));
  const { data } = await waitForEvent(
    reader,
    (event, d) => event === 'project-updated' && (d as ProjectUpdatedEvent).project.counts.implemented === 1,
    5000,
  );
  expect((data as ProjectUpdatedEvent).changes).toEqual([
    {
      kind: 'moved',
      id: 'implemented/feature/2026-01-01-a.md',
      fromId: 'proposed/feature/2026-01-01-a.md',
      title: 'a',
      from: 'proposed',
      to: 'implemented',
    },
  ]);
  await reader.cancel();
});
