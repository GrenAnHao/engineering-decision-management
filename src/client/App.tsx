import { Folder, FolderPlus, RefreshCw, ServerOff, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette, type PaletteCommand } from './components/CommandPalette';
import { NoteDrawer } from './components/NoteDrawer';
import { ProjectRail, sortProjects, type ProjectActions } from './components/ProjectRail';
import { TopBar } from './components/TopBar';
import { findNote } from './derive';
import { THEME_ICONS, VIEW_ICONS } from './icons';
import { THEME_KEYWORDS, THEME_LABELS } from './labels';
import { formatHash, normalizeRoute, VIEW_LABELS, VIEWS, type Route } from './router';
import { useHashRoute } from './state/useHashRoute';
import { useHub } from './state/useHub';
import { useProjectMutations } from './state/useProjectMutations';
import { useProjectNotes } from './state/useProjectNotes';
import { THEME_PREFERENCES, useTheme } from './theme';
import { Banner } from './ui/Banner';
import { DialogProvider } from './ui/dialogs';
import { DashboardSkeleton, EmptyState } from './ui/State';
import { Workspace } from './views/Workspace';

const EMPTY_IN_COUNT: Readonly<Record<string, number>> = {};

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

function Shell() {
  const hub = useHub();
  const mutations = useProjectMutations();
  const { preference: theme, setPreference: setTheme } = useTheme();
  const [parsed, navigate] = useHashRoute();
  const [query, setQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  /** 每次从命令面板「查看全部」自增，通知决策清单清掉之前残留的状态 / 分类筛选 */
  const [directoryResetTick, setDirectoryResetTick] = useState(0);

  // 窄屏抽屉关闭后，焦点还给菜单按钮（抽屉里的按钮此时已不可见，焦点会丢到 body）
  const railWasOpen = useRef(false);
  useEffect(() => {
    if (railWasOpen.current && !railOpen) document.getElementById('rail-toggle')?.focus();
    railWasOpen.current = railOpen;
  }, [railOpen]);

  const visibleProjects = useMemo(() => sortProjects(hub.projects.filter((p) => !p.hidden)), [hub.projects]);
  const visibleIds = useMemo(() => visibleProjects.map((p) => p.id), [visibleProjects]);
  const route = useMemo(
    () => normalizeRoute(parsed, hub.projects.map((p) => p.id), visibleIds),
    [parsed, hub.projects, visibleIds],
  );

  // 把非法 / 不完整的 hash 规整为标准形态
  useEffect(() => {
    if (route && formatHash(route) !== location.hash) navigate(route);
  }, [route, navigate]);

  // 切换项目（左栏点击或 hash 导航）时清空关键字，避免旧词把新项目的清单过滤成空
  useEffect(() => setQuery(''), [route?.projectId]);

  // ⌘K / Ctrl+K 随处可用；「/」仅在没有输入焦点时触发，不抢输入框里的斜杠
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented || e.altKey) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (!mod && e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const project = hub.projects.find((p) => p.id === route?.projectId) ?? null;
  const version = (route ? (hub.versions[route.projectId] ?? 0) : 0) + hub.epoch;
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
  const rescan = useCallback((id: string) => void mutations.rescan(id), [mutations]);
  const selectProject = useCallback(
    (id: string) => {
      if (!route) return;
      setQuery(''); // 同步清空，避免切项目第一帧仍用旧词渲染
      navigate({ projectId: id, view: route.view, note: null });
    },
    [route, navigate],
  );

  const actions: ProjectActions = {
    onSelect: selectProject,
    onAdd: () => void mutations.add(),
    onRename: (p) => void mutations.rename(p),
    onToggleHidden: (p) => void mutations.toggleHidden(p),
    onRemove: (p) => void mutations.remove(p),
    onRescan: (p) => rescan(p.id),
  };

  const commands = useMemo<PaletteCommand[]>(
    () => [
      ...VIEWS.map((v) => ({
        id: `view:${v}`,
        group: '跳转到视图',
        label: VIEW_LABELS[v],
        hint: v === route?.view ? '当前' : undefined,
        icon: VIEW_ICONS[v],
        keywords: v,
        run: () => go({ view: v, note: null }),
      })),
      ...visibleProjects.map((p) => ({
        id: `project:${p.id}`,
        group: '切换项目',
        label: p.displayName,
        hint: p.id === route?.projectId ? '当前' : `${p.count} 条`,
        icon: Folder,
        run: () => selectProject(p.id),
      })),
      { id: 'add', group: '操作', label: '添加项目路径', icon: FolderPlus, keywords: 'add project 新增', run: () => void mutations.add() },
      ...(project
        ? [{ id: 'rescan', group: '操作', label: `重新扫描「${project.displayName}」`, icon: RefreshCw, keywords: 'rescan refresh 刷新', run: () => rescan(project.id) }]
        : []),
      ...THEME_PREFERENCES.map((p) => ({
        id: `theme:${p}`,
        group: '外观',
        label: `主题：${THEME_LABELS[p]}`,
        hint: p === theme ? '当前' : undefined,
        icon: THEME_ICONS[p],
        keywords: THEME_KEYWORDS[p],
        run: () => setTheme(p),
      })),
    ],
    [route, visibleProjects, project, theme, go, selectProject, mutations, rescan, setTheme],
  );

  return (
    <>
      <TopBar
        project={project}
        view={route?.view ?? 'baseline'}
        status={hub.status}
        theme={theme}
        railOpen={railOpen}
        onViewChange={(view) => go({ view })}
        onRescan={rescan}
        onOpenPalette={() => setPaletteOpen(true)}
        onToggleRail={() => setRailOpen((open) => !open)}
        onThemeChange={setTheme}
      />
      <div className="flex">
        <ProjectRail
          projects={hub.projects}
          activeId={route?.projectId ?? null}
          configError={hub.configError}
          actions={actions}
          open={railOpen}
          onClose={() => setRailOpen(false)}
        />
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-20 sm:px-6 lg:px-8">
            {!hub.loaded && !hub.loadError && (
              <DashboardSkeleton />
            )}
            {!hub.loaded && hub.loadError && (
              <EmptyState icon={ServerOff} title="无法连接服务">
                {hub.loadError}（服务恢复后会自动重连）
              </EmptyState>
            )}
            {hub.loaded && hub.loadError && (
              <Banner tone="rose" icon={WifiOff} className="mb-4">
                与服务的连接异常：{hub.loadError}（以下为最近一次的数据）
              </Banner>
            )}
            {hub.loaded && !project && (
              <EmptyState icon={FolderPlus} title="还没有项目">
                在扫描根目录下放一个含 <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs ring-1 ring-line">.agents/notes</code>{' '}
                的项目，或点击左栏「添加项目路径」。
              </EmptyState>
            )}
            {project && route && (
              <Workspace
                key={project.id}
                project={project}
                data={notesState.data}
                error={notesState.error}
                view={route.view}
                query={query}
                directoryResetTick={directoryResetTick}
                onQueryChange={setQuery}
                onViewChange={(view) => go({ view })}
                onOpenNote={openNote}
                onRescan={() => rescan(project.id)}
                onRetry={notesState.retry}
              />
            )}
          </div>
        </main>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        notes={notes ?? []}
        inCount={inCount}
        commands={commands}
        onOpenNote={openNote}
        onShowAll={(q) => {
          setQuery(q);
          setDirectoryResetTick((tick) => tick + 1);
          go({ view: 'directory', note: null });
        }}
      />
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

export function App() {
  return (
    <DialogProvider>
      <Shell />
    </DialogProvider>
  );
}
