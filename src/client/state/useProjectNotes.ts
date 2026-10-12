import { useEffect, useState } from 'react';
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
 */
export function useProjectNotes(projectId: string | null, version: number): NotesState {
  const [state, setState] = useState<NotesState>({ projectId: null, data: null, error: null });

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
  }, [projectId, version]);

  return state.projectId === projectId ? state : { projectId, data: null, error: null };
}
