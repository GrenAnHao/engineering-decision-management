import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectMeta } from '../shared/types';
import { api } from './api';
import { NoteDrawer } from './components/NoteDrawer';
import { ProjectRail, sortProjects, type ProjectActions } from './components/ProjectRail';
import { TopBar } from './components/TopBar';
import { findNote } from './derive';
import { formatHash, normalizeRoute, type Route, type ViewId } from './router';
import { useHashRoute } from './state/useHashRoute';
import { useHub } from './state/useHub';
import { useProjectNotes } from './state/useProjectNotes';
import { Workspace } from './views/Workspace';

const EMPTY_IN_COUNT: Readonly<Record<string, number>> = {};

async function runAction(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (err) {
    window.alert((err as Error).message);
  }
}

export function App() {
  const hub = useHub();
  const [parsed, navigate] = useHashRoute();
  const [query, setQuery] = useState('');

  const visibleIds = useMemo(() => sortProjects(hub.projects.filter((p) => !p.hidden)).map((p) => p.id), [hub.projects]);
  const route = useMemo(
    () => normalizeRoute(parsed, hub.projects.map((p) => p.id), visibleIds),
    [parsed, hub.projects, visibleIds],
  );

  // 把非法 / 不完整的 hash 规整为标准形态
  useEffect(() => {
    if (route && formatHash(route) !== location.hash) navigate(route);
  }, [route, navigate]);

  // 切换项目（左栏点击或 hash 导航）时清空全局搜索词，避免旧词把新项目的清单过滤成空
  useEffect(() => setQuery(''), [route?.projectId]);

  const project = hub.projects.find((p) => p.id === route?.projectId) ?? null;
  const version = (route ? hub.versions[route.projectId] ?? 0 : 0) + hub.epoch;
  const notesState = useProjectNotes(route?.projectId ?? null, version);
  const notes = notesState.data?.notes ?? null;
  const inCount = notesState.data?.inCount ?? EMPTY_IN_COUNT;

  const go = useCallback((patch: Partial<Route>) => route && navigate({ ...route, ...patch }), [route, navigate]);
  const openNote = useCallback(
    (noteId: string) => {
      const note = notes ? findNote(notes, noteId) : undefined;
      const slugIsUnique = note && notes!.filter((n) => n.slug === note.slug).length === 1;
      go({ note: note && slugIsUnique ? note.slug : noteId });
    },
    [notes, go],
  );
  const closeNote = useCallback(() => go({ note: null }), [go]);
  const rescan = useCallback((id: string) => void runAction(() => api.rescan(id)), []);

  const actions: ProjectActions = {
    onSelect: (id) => {
      if (!route) return;
      setQuery(''); // 同步清空，避免切项目第一帧仍用旧词渲染
      navigate({ projectId: id, view: route.view, note: null });
    },
    onAdd: () => {
      const path = window.prompt('输入项目的绝对路径（目录下需有 .agents/notes）');
      const cleaned = path?.trim().replace(/^"(.*)"$/, '$1'); // 资源管理器"复制为路径"会带引号
      if (cleaned) void runAction(() => api.addProject(cleaned));
    },
    onRename: (p: ProjectMeta) => {
      const name = window.prompt('显示名（留空恢复为文件夹名）', p.displayName);
      if (name !== null) void runAction(() => api.patchProject(p.id, { name: name.trim() || null }));
    },
    onToggleHidden: (p) => void runAction(() => api.patchProject(p.id, { hidden: !p.hidden })),
    onRemove: (p) => {
      if (window.confirm(`从列表移除「${p.displayName}」？（不会删除任何文件）`)) void runAction(() => api.removeProject(p.id));
    },
    onRescan: (p) => rescan(p.id),
  };

  return (
    <>
      <TopBar
        project={project}
        projects={hub.projects}
        view={route?.view ?? 'baseline'}
        status={hub.status}
        onViewChange={(view: ViewId) => go({ view })}
        onRescan={rescan}
        search={{
          notes: notes ?? [],
          inCount,
          query,
          onQueryChange: setQuery,
          onOpenNote: openNote,
          onShowAll: () => go({ view: 'directory' }),
        }}
      />
      <div className="shell">
        <ProjectRail projects={hub.projects} activeId={route?.projectId ?? null} configError={hub.configError} actions={actions} />
        <div className="canvas">
          <main className="mission-canvas">
            {!hub.loaded && !hub.loadError && <div className="skeleton-block" />}
            {!hub.loaded && hub.loadError && (
              <div className="state-panel">
                <h2>无法连接服务</h2>
                <p>{hub.loadError}（服务恢复后会自动重连）</p>
              </div>
            )}
            {hub.loaded && hub.loadError && (
              <div className="update-banner deleted">与服务的连接异常：{hub.loadError}（以下为最近一次的数据）</div>
            )}
            {hub.loaded && !project && (
              <div className="state-panel">
                <h2>还没有项目</h2>
                <p>在扫描根目录下放一个含 <code>.agents/notes</code> 的项目，或点击左栏「+ 添加项目路径」。</p>
              </div>
            )}
            {project && route && (
              <Workspace
                key={project.id}
                project={project}
                data={notesState.data}
                error={notesState.error}
                view={route.view}
                query={query}
                onClearQuery={() => setQuery('')}
                onViewChange={(view) => go({ view })}
                onOpenNote={openNote}
                onRescan={() => rescan(project.id)}
                onRetry={notesState.retry}
              />
            )}
          </main>
        </div>
      </div>
      {project && route?.note && (
        <NoteDrawer
          key={`${project.id}/${route.note}`}
          projectId={project.id}
          noteKey={route.note}
          notes={notes}
          inCount={inCount}
          onClose={closeNote}
          onOpenNote={openNote}
        />
      )}
    </>
  );
}
