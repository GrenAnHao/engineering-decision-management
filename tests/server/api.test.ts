import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigResponse, NoteDetailResponse, NotesResponse, ProjectMeta } from '../../src/shared/types';
import { isTrustedRequest } from '../../src/server/api';
import { makeProject, makeTempDir, note } from '../helpers/fixture';
import { startTestServer, type TestEnv } from '../helpers/server';

let env: TestEnv | null = null;
let extraCleanup = () => {};
afterEach(() => {
  env?.close();
  env = null;
  extraCleanup();
  extraCleanup = () => {};
});

const NOTES = {
  'implemented/architecture/2026-01-01-base.md': note('基础'),
  'implemented/feature/2026-02-01-child.md': note('子', 'implemented', '## Decision\n\n见 [基础](../architecture/2026-01-01-base.md)\n'),
  'rejected/feature/2026-03-01-no.md': note('否决', 'rejected — 不需要'),
};

async function start(): Promise<TestEnv> {
  env = await startTestServer((root) => {
    makeProject(root, 'Alpha', NOTES);
    makeProject(root, 'Beta', { 'proposed/process/2026-04-01-p.md': note('提案', 'proposed') });
  });
  return env;
}

const getJson = async <T>(url: string): Promise<T> => (await fetch(url)).json() as Promise<T>;

describe('GET 接口', () => {
  test('/api/config 返回发现的项目与元数据', async () => {
    const { base } = await start();
    const config = await getJson<ConfigResponse>(`${base}/api/config`);
    expect(config.configError).toBeNull();
    expect(config.projects.map((p) => p.id).sort()).toEqual(['Alpha', 'Beta']);
    const alpha = config.projects.find((p) => p.id === 'Alpha')!;
    expect(alpha).toMatchObject({ source: 'discovered', healthy: true, watchMode: 'live', count: 3 });
    expect(alpha.counts).toEqual({ implemented: 2, proposed: 0, rejected: 1, archived: 0 });
  });

  test('/api/projects/:id/notes 不含 rawBody，带 inCount', async () => {
    const { base } = await start();
    const res = await getJson<NotesResponse>(`${base}/api/projects/Alpha/notes`);
    expect(res.notes).toHaveLength(3);
    expect(res.notes.every((n) => !('rawBody' in n))).toBe(true);
    expect(res.inCount).toEqual({ 'implemented/architecture/2026-01-01-base.md': 1 });
  });

  test('/api/projects/:id/notes/:noteId 返回完整内容（noteId 需 URL 编码）', async () => {
    const { base } = await start();
    const id = encodeURIComponent('rejected/feature/2026-03-01-no.md');
    const { note: doc } = await getJson<NoteDetailResponse>(`${base}/api/projects/Alpha/notes/${id}`);
    expect(doc.rawBody).toContain('# Agent Note: 否决');
    expect(doc.verdict).toBe('不需要');
  });

  test('未知项目 / 笔记 / 接口返回 404 JSON', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/projects/Nope/notes`)).status).toBe(404);
    expect((await fetch(`${base}/api/projects/Alpha/notes/x.md`)).status).toBe(404);
    const res = await fetch(`${base}/api/unknown`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain('未知接口');
  });
});

describe('项目管理接口', () => {
  test('POST 添加手动项目 → 写 config.json → 出现在列表', async () => {
    const { base, configPath } = await start();
    const outside = makeTempDir();
    extraCleanup = outside.cleanup;
    const path = makeProject(outside.dir, 'Gamma', { 'implemented/testing/2026-05-01-t.md': note('t') });

    const res = await fetch(`${base}/api/projects`, { method: 'POST', body: JSON.stringify({ path }) });
    expect(res.status).toBe(201);
    const meta = (await res.json()) as ProjectMeta;
    expect(meta).toMatchObject({ id: 'Gamma', source: 'manual', count: 1 });
    expect(JSON.parse(readFileSync(configPath, 'utf8')).projects).toEqual([{ path, name: null, hidden: false }]);

    const again = await fetch(`${base}/api/projects`, { method: 'POST', body: JSON.stringify({ path }) });
    expect(again.status).toBe(409);
  });

  test('同一路径并发 POST 只成功一次，config 不出现重复条目', async () => {
    const { base, configPath } = await start();
    const outside = makeTempDir();
    extraCleanup = outside.cleanup;
    const path = makeProject(outside.dir, 'Gamma', {});
    const statuses = await Promise.all(
      [1, 2, 3].map(() => fetch(`${base}/api/projects`, { method: 'POST', body: JSON.stringify({ path }) }).then((r) => r.status)),
    );
    expect(statuses.sort()).toEqual([201, 409, 409]);
    expect(JSON.parse(readFileSync(configPath, 'utf8')).projects).toHaveLength(1);
  });

  test('POST 校验：相对路径 / 无 .agents/notes / 非 JSON 都是 400', async () => {
    const { base, root } = await start();
    const post = (body: string) => fetch(`${base}/api/projects`, { method: 'POST', body });
    expect((await post(JSON.stringify({ path: 'relative/path' }))).status).toBe(400);
    expect((await post(JSON.stringify({ path: root }))).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
    expect((await post(JSON.stringify({}))).status).toBe(400);
  });

  test('DELETE 只能移除手动项目', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/projects/Alpha`, { method: 'DELETE' })).status).toBe(409);

    const outside = makeTempDir();
    extraCleanup = outside.cleanup;
    const path = makeProject(outside.dir, 'Gamma', {});
    await fetch(`${base}/api/projects`, { method: 'POST', body: JSON.stringify({ path }) });
    expect((await fetch(`${base}/api/projects/Gamma`, { method: 'DELETE' })).status).toBe(204);
    const config = await getJson<ConfigResponse>(`${base}/api/config`);
    expect(config.projects.map((p) => p.id)).not.toContain('Gamma');
  });

  test('PATCH 改显示名与隐藏标记，发现项目仍保持 discovered', async () => {
    const { base, configPath } = await start();
    const res = await fetch(`${base}/api/projects/Alpha`, { method: 'PATCH', body: JSON.stringify({ name: '甲', hidden: true }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'Alpha', displayName: '甲', hidden: true, source: 'discovered' });
    expect(JSON.parse(readFileSync(configPath, 'utf8')).projects[0]).toMatchObject({ name: '甲', hidden: true });

    const reset = await fetch(`${base}/api/projects/Alpha`, { method: 'PATCH', body: JSON.stringify({ name: null }) });
    expect(await reset.json()).toMatchObject({ displayName: 'Alpha', hidden: true });
  });

  test('PATCH 校验字段类型', async () => {
    const { base } = await start();
    const patch = (body: unknown) => fetch(`${base}/api/projects/Alpha`, { method: 'PATCH', body: JSON.stringify(body) });
    expect((await patch({ hidden: 'yes' })).status).toBe(400);
    expect((await patch({ name: 1 })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
  });

  test('POST rescan 返回最新元数据', async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/projects/Beta/rescan`, { method: 'POST' });
    expect(await res.json()).toMatchObject({ id: 'Beta', count: 1 });
  });

  test('config.json 损坏时写操作返回 409 且不覆盖文件', async () => {
    const { base, configPath } = await start();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(configPath, '{ broken');
    const res = await fetch(`${base}/api/projects/Alpha`, { method: 'PATCH', body: JSON.stringify({ hidden: true }) });
    expect(res.status).toBe(409);
    expect(readFileSync(configPath, 'utf8')).toBe('{ broken');
  });
});

describe('健康状态与来源校验', () => {
  test('手动项目路径失效时 healthy=false、watchMode=manual，不影响其他项目', async () => {
    const missing = makeTempDir();
    extraCleanup = missing.cleanup;
    env = await startTestServer(
      (root) => makeProject(root, 'Alpha', NOTES),
      { projects: [{ path: join(missing.dir, 'Ghost'), name: null, hidden: false }] },
    );
    const config = await getJson<ConfigResponse>(`${env.base}/api/config`);
    const ghost = config.projects.find((p) => p.id === 'Ghost')!;
    expect(ghost).toMatchObject({ healthy: false, watchMode: 'manual', source: 'manual' });
    expect(ghost.error).toContain('路径失效');
    expect(config.projects.find((p) => p.id === 'Alpha')!.healthy).toBe(true);
  });

  test('isTrustedRequest 拒绝外部 Host 与跨源 Origin', () => {
    const req = (headers: Record<string, string>) => new Request('http://127.0.0.1:5173/api/config', { headers });
    expect(isTrustedRequest(req({ host: '127.0.0.1:5173' }))).toBe(true);
    expect(isTrustedRequest(req({ host: 'localhost:5173', origin: 'http://localhost:5173' }))).toBe(true);
    expect(isTrustedRequest(req({ host: 'evil.com:5173' }))).toBe(false);
    expect(isTrustedRequest(req({ host: '127.0.0.1:5173', origin: 'https://evil.com' }))).toBe(false);
  });
});
