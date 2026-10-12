import { useCallback, useEffect, useState } from 'react';
import type { ConfigChangedEvent, ProjectMeta, ProjectUpdatedEvent } from '../../shared/types';
import { api } from '../api';

export type SyncStatus = 'connecting' | 'live' | 'reconnecting' | 'polling';

export type HubState = {
  loaded: boolean;
  projects: ProjectMeta[];
  configError: string | null;
  status: SyncStatus;
  /** 每个项目收到 project-updated 的次数，驱动该项目笔记 refetch */
  versions: Record<string, number>;
  /** SSE 重连 / 轮询计数，驱动全量 refetch */
  epoch: number;
};

const POLL_MS = 30_000;

const INITIAL: HubState = { loaded: false, projects: [], configError: null, status: 'connecting', versions: {}, epoch: 0 };

function upsert(projects: ProjectMeta[], next: ProjectMeta): ProjectMeta[] {
  return projects.some((p) => p.id === next.id) ? projects.map((p) => (p.id === next.id ? next : p)) : [...projects, next];
}

function parse<T>(event: Event): T {
  return JSON.parse((event as MessageEvent<string>).data) as T;
}

/** 项目清单 + SSE 实时同步。不支持 EventSource 时降级为 30 s 轮询。 */
export function useHub(): HubState & { refreshConfig: () => Promise<void> } {
  const [state, setState] = useState<HubState>(INITIAL);

  const refreshConfig = useCallback(async () => {
    try {
      const config = await api.config();
      setState((s) => ({ ...s, loaded: true, projects: config.projects, configError: config.configError }));
    } catch (err) {
      console.error('[hub] 读取配置失败', err);
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

    const source = new EventSource('/api/events');
    let connectedOnce = false;
    source.addEventListener('connected', () => {
      setState((s) => ({ ...s, status: 'live', epoch: connectedOnce ? s.epoch + 1 : s.epoch }));
      if (connectedOnce) void refreshConfig();
      connectedOnce = true;
    });
    source.addEventListener('project-updated', (event) => {
      const data = parse<ProjectUpdatedEvent>(event);
      setState((s) => ({
        ...s,
        projects: upsert(s.projects, data.project),
        versions: { ...s.versions, [data.id]: (s.versions[data.id] ?? 0) + 1 },
      }));
    });
    source.addEventListener('config-changed', (event) => {
      const data = parse<ConfigChangedEvent>(event);
      setState((s) => ({ ...s, projects: data.projects }));
    });
    source.addEventListener('project-error', () => void refreshConfig());
    source.onerror = () => setState((s) => ({ ...s, status: s.status === 'connecting' ? 'connecting' : 'reconnecting' }));
    return () => source.close();
  }, [refreshConfig]);

  return { ...state, refreshConfig };
}
