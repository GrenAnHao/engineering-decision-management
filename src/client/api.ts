import type { ConfigResponse, NoteDetailResponse, NotesResponse, ProjectMeta } from '../shared/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `请求失败：HTTP ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const seg = encodeURIComponent;

export const api = {
  config: () => request<ConfigResponse>('/api/config'),
  notes: (projectId: string) => request<NotesResponse>(`/api/projects/${seg(projectId)}/notes`),
  note: (projectId: string, noteId: string) =>
    request<NoteDetailResponse>(`/api/projects/${seg(projectId)}/notes/${seg(noteId)}`),
  addProject: (path: string) => request<ProjectMeta>('/api/projects', { method: 'POST', body: JSON.stringify({ path }) }),
  patchProject: (id: string, patch: { name?: string | null; hidden?: boolean }) =>
    request<ProjectMeta>(`/api/projects/${seg(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  removeProject: (id: string) => request<void>(`/api/projects/${seg(id)}`, { method: 'DELETE' }),
  rescan: (id: string) => request<ProjectMeta>(`/api/projects/${seg(id)}/rescan`, { method: 'POST' }),
};
