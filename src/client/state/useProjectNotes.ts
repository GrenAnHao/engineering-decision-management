import { useCallback, useEffect, useState } from 'react';
import type { NotesResponse } from '../../shared/types';
import { api } from '../api';

export type NotesState = {
  projectId: string | null;
  data: NotesResponse | null;
  error: string | null;
};

/**
 * 当前项目的笔记。version 变化时后台 refetch：期间保留旧数据渲染，拿到新数据后原子替换；
 * 只有切换到新项目时 data 才为 null（显示骨架）。过期响应被丢弃。
 * retry 递增 attempt 触发一次重新拉取（用于加载失败后的重试）。
 */
export function useProjectNotes(projectId: string | null, version: number): NotesState & { retry: () => void } {
  const [state, setState] = useState<NotesState>({ projectId: null, data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    api
      .notes(projectId)
      .then((data) => {
        if (!cancelled) setState({ projectId, data, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState((s) => ({ projectId, data: s.projectId === projectId ? s.data : null, error: err.message }));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, version, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const current: NotesState = state.projectId === projectId ? state : { projectId, data: null, error: null };
  return { ...current, retry };
}
