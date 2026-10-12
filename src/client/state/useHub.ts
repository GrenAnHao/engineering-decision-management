import { useCallback, useEffect, useState } from 'react';
import type { ConfigChangedEvent, ProjectMeta, ProjectUpdatedEvent } from '../../shared/types';
import { api } from '../api';

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
 */
export function useHub(): HubState & { refreshConfig: () => Promise<void> } {
  const [state, setState] = useState<HubState>(INITIAL);

  const refreshConfig = useCallback(async () => {
    try {
      const config = await api.config();
      setState((s) => ({ ...s, loaded: true, loadError: null, projects: config.projects, configError: config.configError }));
    } catch (err) {
      setState((s) => ({ ...s, loadError: (err as Error).message }));
    }
  }, []);

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
        setState((s) => ({
          ...s,
          projects: upsert(s.projects, data.project),
          versions: { ...s.versions, [data.id]: (s.versions[data.id] ?? 0) + 1 },
        }));
      });
      es.addEventListener('config-changed', (event) => {
        const data = parse<ConfigChangedEvent>(event);
        if (data) setState((s) => ({ ...s, projects: data.projects }));
        // 事件不带 configError，补拉一次以同步配置文件错误提示
        void refreshConfig();
      });
      es.addEventListener('project-error', () => void refreshConfig());
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
  }, [refreshConfig]);

  return { ...state, refreshConfig };
}
