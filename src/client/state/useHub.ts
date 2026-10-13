import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConfigChangedEvent, ProjectErrorEvent, ProjectMeta, ProjectUpdatedEvent } from '../../shared/types';
import { api } from '../api';
import { projectsAfterRefresh } from './projects';
import { toNotifications, type HubNotifyEvent } from '../notifications/derive';
import type { AppNotification } from '../notifications/types';

export type SyncStatus = 'connecting' | 'live' | 'reconnecting' | 'polling';

export type HubState = {
  loaded: boolean;
  /** 读取项目清单失败的原因（服务未启动等）；成功后清空 */
  loadError: string | null;
  projects: ProjectMeta[];
  configError: string | null;
  status: SyncStatus;
  /** 每个项目收到 project-updated 的次数，驱动该项目笔记 refetch */
  versions: Record<string, number>;
  /** SSE 重连 / 轮询计数，驱动全量 refetch */
  epoch: number;
};

const POLL_MS = 30_000;
const MAX_RETRY_MS = 30_000;

const INITIAL: HubState = {
  loaded: false,
  loadError: null,
  projects: [],
  configError: null,
  status: 'connecting',
  versions: {},
  epoch: 0,
};

function upsert(projects: ProjectMeta[], next: ProjectMeta): ProjectMeta[] {
  return projects.some((p) => p.id === next.id) ? projects.map((p) => (p.id === next.id ? next : p)) : [...projects, next];
}

function parse<T>(event: Event): T | null {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as T;
  } catch {
    return null;
  }
}

/**
 * 项目清单 + SSE 实时同步。
 * - 每次（重新）连上都拉一次清单，首次加载失败也能自愈；重连时 epoch+1 触发笔记全量 refetch。
 * - EventSource 进入 CLOSED（服务端返回非 200，如重启中的 503）时不会自行重连，这里按指数退避重建。
 * - 不支持 EventSource 时降级为 30 s 轮询。
 * - project-updated / project-error 经 toNotifications 转成通知交给 onNotify（隐藏项目、首次扫描不产生通知）。
 */
export function useHub(onNotify?: (items: readonly AppNotification[]) => void): HubState & { refreshConfig: () => Promise<void> } {
  const [state, setState] = useState<HubState>(INITIAL);

  /**
   * 项目清单的唯一写入源：每次改清单都先在事件回调里同步算出新数组写进 ref，再把同一个数组 set 进 state。
   * 所有写 projects 的地方都走 commitProjects、都不从 s.projects 推导，所以入队顺序 = ref 写入顺序，
   * 最后生效的 state.projects 一定等于 ref；连续两条事件之间还没渲染时，取「变化前」的 meta 也不会拿到旧值。
   */
  const projectsRef = useRef<ProjectMeta[]>([]);
  /** 递增的 project-updated 序号，以及每个项目最近一次 updated 的序号：用来判断 refresh 响应是否比内存旧 */
  const updateSeqRef = useRef(0);
  const updatedAtSeqRef = useRef(new Map<string, number>());
  /** config-changed 的次数：refresh 期间来过的话，响应里的清单比事件带来的旧 */
  const configSeqRef = useRef(0);
  const lastErrorsRef = useRef<ReadonlyMap<string, string>>(new Map());
  const onNotifyRef = useRef(onNotify);
  useEffect(() => {
    onNotifyRef.current = onNotify;
  });

  const commitProjects = useCallback((projects: ProjectMeta[], patch: (s: HubState) => Partial<HubState> = () => ({})) => {
    projectsRef.current = projects;
    setState((s) => ({ ...s, ...patch(s), projects }));
  }, []);

  const notify = useCallback((event: HubNotifyEvent) => {
    // 通知只是附带功能：这里出错不能拦住后面的清单更新
    try {
      const prev = projectsRef.current.find((p) => p.id === event.data.id);
      const result = toNotifications(event, prev, lastErrorsRef.current);
      lastErrorsRef.current = result.lastErrors;
      if (result.notifications.length > 0) onNotifyRef.current?.(result.notifications);
    } catch (err) {
      console.error('[notify] 变更通知处理失败', err);
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    // 用序号而不是「开始时清空集合」：多个 refresh 重叠时，后发的不会抹掉先发那次期间记下的更新
    const startedAt = updateSeqRef.current;
    const configSeqAtStart = configSeqRef.current;
    try {
      const config = await api.config();
      const next = projectsAfterRefresh(config.projects, projectsRef.current, {
        configChanged: configSeqRef.current > configSeqAtStart,
        isNewer: (id) => (updatedAtSeqRef.current.get(id) ?? 0) > startedAt,
      });
      const patch = { loaded: true, loadError: null, configError: config.configError };
      if (next) commitProjects(next, () => patch);
      else setState((s) => ({ ...s, ...patch }));
    } catch (err) {
      setState((s) => ({ ...s, loadError: (err as Error).message }));
    }
  }, [commitProjects]);

  useEffect(() => {
    void refreshConfig();

    if (typeof EventSource === 'undefined') {
      setState((s) => ({ ...s, status: 'polling' }));
      const timer = setInterval(() => {
        void refreshConfig();
        setState((s) => ({ ...s, epoch: s.epoch + 1 }));
      }, POLL_MS);
      return () => clearInterval(timer);
    }

    let disposed = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let connectedOnce = false;

    const connect = () => {
      if (disposed) return;
      const es = new EventSource('/api/events');
      source = es;
      es.addEventListener('connected', () => {
        attempt = 0;
        setState((s) => ({ ...s, status: 'live', epoch: connectedOnce ? s.epoch + 1 : s.epoch }));
        void refreshConfig();
        connectedOnce = true;
      });
      es.addEventListener('project-updated', (event) => {
        const data = parse<ProjectUpdatedEvent>(event);
        if (!data) return void refreshConfig();
        notify({ name: 'project-updated', data });
        updateSeqRef.current += 1;
        updatedAtSeqRef.current.set(data.id, updateSeqRef.current);
        commitProjects(upsert(projectsRef.current, data.project), (s) => ({
          versions: { ...s.versions, [data.id]: (s.versions[data.id] ?? 0) + 1 },
        }));
      });
      es.addEventListener('config-changed', (event) => {
        const data = parse<ConfigChangedEvent>(event);
        if (data) {
          configSeqRef.current += 1;
          commitProjects(data.projects);
        }
        // 事件不带 configError，补拉一次以同步配置文件错误提示
        void refreshConfig();
      });
      es.addEventListener('project-error', (event) => {
        const data = parse<ProjectErrorEvent>(event);
        if (data) notify({ name: 'project-error', data });
        void refreshConfig();
      });
      es.onerror = () => {
        setState((s) => ({ ...s, status: s.status === 'connecting' ? 'connecting' : 'reconnecting' }));
        if (es.readyState !== EventSource.CLOSED) return; // CONNECTING：浏览器会自行重连
        es.close();
        const delay = Math.min(MAX_RETRY_MS, 1000 * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      source?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [refreshConfig, notify, commitProjects]);

  return { ...state, refreshConfig };
}
