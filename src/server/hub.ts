import { isAbsolute, resolve } from 'node:path';
import type { ConfigResponse, NoteDetailResponse, NotesResponse, ProjectMeta } from '../shared/types';
import { ConfigStore, type Config } from './config';
import { allocateId, discoverProjects, hasNotesDir, pathKey, resolveProjects } from './discovery';
import { Broadcaster } from './events';
import { notesDir, scanNotes } from './scan';
import { applyScan, createIndex, markUnhealthy, toMeta, toSummary, type ProjectIndex, type ScanCause } from './store';
import { watchNotes, type WatchHandle } from './watcher';

/** 带 HTTP 状态码的业务错误，api.ts 据此返回对应响应 */
export class HubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type ProjectPatch = { name?: string | null; hidden?: boolean };

export type HubOptions = { configPath: string; heartbeatMs?: number };

/** 进程内唯一的状态中心：项目索引、文件监听、配置读写、事件广播 */
export class Hub {
  readonly config: ConfigStore;
  readonly events: Broadcaster;
  private readonly projects = new Map<string, ProjectIndex>();
  private readonly watchers = new Map<string, WatchHandle>();
  private readonly scanQueues = new Map<string, Promise<unknown>>();
  private syncChain: Promise<unknown> = Promise.resolve();
  private rootsTimer: ReturnType<typeof setInterval> | null = null;
  private nextOrder = 0;
  private stopped = false;

  constructor(opts: HubOptions) {
    this.config = new ConfigStore(opts.configPath);
    this.events = new Broadcaster(opts.heartbeatMs);
  }

  async start(): Promise<void> {
    await this.config.load();
    await this.syncProjects();
    const { rescanRootsMs } = this.config.current.watch;
    if (rescanRootsMs > 0) this.rootsTimer = setInterval(() => void this.refreshRoots(), rescanRootsMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.rootsTimer) clearInterval(this.rootsTimer);
    for (const handle of this.watchers.values()) handle.close();
    this.watchers.clear();
    this.events.close();
  }

  getProject(id: string): ProjectIndex | undefined {
    return this.projects.get(id);
  }

  listMeta(): ProjectMeta[] {
    return [...this.projects.values()].sort((a, b) => a.order - b.order).map(toMeta);
  }

  configResponse(): ConfigResponse {
    const { port, scanRoots, scanDepth } = this.config.current;
    return { port, scanRoots, scanDepth, configError: this.config.error, projects: this.listMeta() };
  }

  notesResponse(id: string): NotesResponse {
    const index = this.requireProject(id);
    return {
      project: toMeta(index),
      notes: index.notes.map(toSummary),
      inCount: Object.fromEntries(index.inCount),
    };
  }

  noteDetail(id: string, noteId: string): NoteDetailResponse {
    const note = this.requireProject(id).byId.get(noteId);
    if (!note) throw new HubError(404, `未知笔记：${noteId}`);
    return { note };
  }

  /** 定期重扫扫描根：只看目录结构，项目集合有变化才广播 */
  async refreshRoots(): Promise<void> {
    try {
      if (await this.syncProjects()) this.broadcastConfig();
    } catch (err) {
      console.error(`[hub] 重扫扫描根失败：${(err as Error).message}`);
    }
  }

  /** 发现 + 配置 → 对账内存索引（串行执行）。返回项目集合或元数据是否变化 */
  syncProjects(): Promise<boolean> {
    const run = () => this.syncNow();
    const result = this.syncChain.then(run, run);
    this.syncChain = result.catch(() => undefined);
    return result;
  }

  rescan(id: string, cause: ScanCause): Promise<ProjectIndex | undefined> {
    const run = () => this.scanNow(id, cause);
    const result = (this.scanQueues.get(id) ?? Promise.resolve()).then(run, run);
    this.scanQueues.set(id, result.catch(() => undefined));
    return result;
  }

  async manualRescan(id: string): Promise<ProjectMeta> {
    this.requireProject(id);
    const next = await this.rescan(id, 'manual');
    if (!next) throw new HubError(404, `未知项目：${id}`);
    return toMeta(next);
  }

  async addProject(rawPath: string): Promise<ProjectMeta> {
    const path = rawPath.trim();
    if (!path || !isAbsolute(path)) throw new HubError(400, '请填写项目的绝对路径');
    if (!(await hasNotesDir(path))) throw new HubError(400, `该目录下没有 .agents/notes：${path}`);
    const key = pathKey(path);
    if (this.findByKey(key)) throw new HubError(409, '该项目已在列表中');
    await this.updateConfig((c) => ({ ...c, projects: [...c.projects, { path: resolve(path), name: null, hidden: false }] }));
    await this.syncProjects();
    this.broadcastConfig();
    const added = this.findByKey(key);
    if (!added) throw new HubError(500, '添加后未能载入项目');
    return toMeta(added);
  }

  async removeProject(id: string): Promise<void> {
    const index = this.requireProject(id);
    if (index.source !== 'manual') throw new HubError(409, '自动发现的项目不能移除，可以隐藏');
    await this.updateConfig((c) => ({ ...c, projects: c.projects.filter((e) => pathKey(e.path) !== index.key) }));
    await this.syncProjects();
    this.broadcastConfig();
  }

  async patchProject(id: string, patch: ProjectPatch): Promise<ProjectMeta> {
    const index = this.requireProject(id);
    await this.updateConfig((c) => {
      const existing = c.projects.find((e) => pathKey(e.path) === index.key);
      const base = existing ?? { path: index.path, name: null, hidden: false };
      const next = {
        ...base,
        ...(patch.name !== undefined ? { name: patch.name?.trim() || null } : {}),
        ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
      };
      const projects = existing
        ? c.projects.map((e) => (e === existing ? next : e))
        : [...c.projects, next];
      return { ...c, projects };
    });
    await this.syncProjects();
    this.broadcastConfig();
    return toMeta(this.requireProject(id));
  }

  private async syncNow(): Promise<boolean> {
    const { scanRoots, scanDepth, projects: entries } = this.config.current;
    const specs = resolveProjects(await discoverProjects(scanRoots, scanDepth), entries);
    const remaining = new Map([...this.projects.values()].map((p) => [p.key, p]));
    const added: string[] = [];
    let changed = false;

    for (const spec of specs) {
      const existing = remaining.get(spec.key);
      if (existing) {
        remaining.delete(spec.key);
        const { displayName, hidden, source } = spec;
        if (existing.displayName !== displayName || existing.hidden !== hidden || existing.source !== source) {
          this.projects.set(existing.id, { ...existing, displayName, hidden, source });
          changed = true;
        }
        continue;
      }
      const id = allocateId(spec.folderName, new Set(this.projects.keys()));
      this.projects.set(
        id,
        createIndex({
          id,
          key: spec.key,
          path: spec.path,
          displayName: spec.displayName,
          source: spec.source,
          hidden: spec.hidden,
          order: this.nextOrder++,
        }),
      );
      added.push(id);
      changed = true;
    }

    for (const gone of remaining.values()) {
      this.dropProject(gone.id);
      changed = true;
    }

    await Promise.all(
      added.map((id) => {
        this.startWatch(id);
        return this.rescan(id, 'initial');
      }),
    );
    return changed;
  }

  private async scanNow(id: string, cause: ScanCause): Promise<ProjectIndex | undefined> {
    if (this.stopped || !this.projects.has(id)) return this.projects.get(id);
    if (cause === 'manual' && this.projects.get(id)!.watchMode === 'manual') this.startWatch(id);
    const path = this.projects.get(id)!.path;
    try {
      const { notes, scanMs } = await scanNotes(notesDir(path));
      const current = this.projects.get(id);
      if (!current) return undefined;
      const next = applyScan(current, notes, scanMs, cause, Date.now());
      this.projects.set(id, next);
      this.events.broadcast('project-updated', {
        id,
        count: notes.length,
        delta: notes.length - current.notes.length,
        scanMs,
        at: next.scannedAt,
        project: toMeta(next),
      });
      return next;
    } catch (err) {
      const current = this.projects.get(id);
      if (!current) return undefined;
      const reason = `路径失效：${(err as Error).message}`;
      const next = markUnhealthy(current, reason);
      this.projects.set(id, next);
      this.events.broadcast('project-error', { id, reason });
      return next;
    }
  }

  private startWatch(id: string): void {
    const index = this.projects.get(id);
    if (!index) return;
    this.watchers.get(id)?.close();
    this.watchers.delete(id);
    try {
      const handle = watchNotes(notesDir(index.path), {
        debounceMs: this.config.current.watch.debounceMs,
        onChange: () => void this.rescan(id, 'file'),
        onError: (err) => this.degrade(id, err),
      });
      this.watchers.set(id, handle);
      this.projects.set(id, { ...index, watchMode: 'live' });
    } catch (err) {
      this.degrade(id, err as Error);
    }
  }

  private degrade(id: string, err: Error): void {
    this.watchers.get(id)?.close();
    this.watchers.delete(id);
    const index = this.projects.get(id);
    if (!index) return;
    this.projects.set(id, { ...index, watchMode: 'manual' });
    this.events.broadcast('project-error', { id, reason: `实时监听不可用，已切换为手动刷新：${err.message}` });
  }

  private dropProject(id: string): void {
    this.watchers.get(id)?.close();
    this.watchers.delete(id);
    this.scanQueues.delete(id);
    this.projects.delete(id);
  }

  private findByKey(key: string): ProjectIndex | undefined {
    return [...this.projects.values()].find((p) => p.key === key);
  }

  private requireProject(id: string): ProjectIndex {
    const index = this.projects.get(id);
    if (!index) throw new HubError(404, `未知项目：${id}`);
    return index;
  }

  private async updateConfig(mutate: (config: Config) => Config): Promise<void> {
    try {
      await this.config.update(mutate);
    } catch (err) {
      throw new HubError(409, (err as Error).message);
    }
  }

  private broadcastConfig(): void {
    this.events.broadcast('config-changed', { projects: this.listMeta() });
  }
}
