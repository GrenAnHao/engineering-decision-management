# 变更通知、主题分段切换与全屏 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 主题改为三段单选；实时监听到笔记变化时弹应用内卡片或系统通知，并收进铃铛打开的通知抽屉（可清除、可跳转）；顶栏加全屏按钮。

**架构：** 服务端在 `scanNow` 里用纯函数 `diffNotes` 比对新旧笔记，作为可选字段 `changes` 附在 `project-updated` 上。前端由纯函数 `toNotifications` 把事件转成通知，存进 `localStorage` 支撑的模块级 store。`useNotificationCenter` 根据抽屉开关和页面是否可见，决定是弹卡片还是发系统通知。视图切换与主题切换共用从 `ViewTabs` 抽出的 `SegmentedControl`。笔记抽屉与通知抽屉共用从 `NoteDrawer` 抽出的 `ui/Drawer`。

**技术栈：** Bun 1.3（服务端 + `bun test`）、React 19、Vite 8、Tailwind CSS 4、tailwind-variants、lucide-react、TypeScript 7。

**规格：** `docs/superpowers/specs/2026-10-12-change-notifications-design.md`。视觉约定见 `docs/superpowers/specs/2026-10-12-modern-ui-design-system.md`：不写色值、不加依赖，状态色只通过 `ui/Badge` 的 `tone` 使用。

**约定：**
- 所有命令都在 worktree 根目录 `D:\OneDrive\Project Files\Engineering Decision Management\.claude\worktrees\beautiful-tereshkova-36c490` 下执行。
- 组件测试沿用仓库现有写法，用 `renderToStaticMarkup` 做静态渲染断言（测试环境没有 DOM）。
- commit 信息用中文，遵循 Conventional Commits。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/shared/types.ts` | 改 | 新增 `NoteChange`；`ProjectUpdatedEvent.changes?`；`ProjectErrorEvent.at` |
| `src/server/store.ts` | 改 | 新增纯函数 `diffNotes` |
| `src/server/hub.ts` | 改 | `scanNow` 附带 `changes`；两处 `project-error` 补 `at` |
| `src/client/ui/SegmentedControl.tsx` | 建 | 滑动底板分段控件，`nav` / `radio` 两种语义 |
| `src/client/theme.ts` | 改 | `cycle` → `setPreference`，导出 `THEME_PREFERENCES` |
| `src/client/labels.ts` / `src/client/icons.ts` | 改 | `THEME_LABELS` / `THEME_ICONS` |
| `src/client/format.ts` | 改 | `clockTime`、`dayGroup` |
| `src/client/notifications/types.ts` | 建 | `AppNotification` 类型 |
| `src/client/notifications/derive.ts` | 建 | 事件 → 通知、摘要文案、按天分组、变更标签与色调 |
| `src/client/notifications/store.ts` | 建 | 通知持久化 store |
| `src/client/notifications/desktop.ts` | 建 | 系统通知权限与发送 |
| `src/client/notifications/useNotificationCenter.ts` | 建 | 抽屉开关、弹出队列、入库分发 |
| `src/client/ui/Drawer.tsx` | 建 | 遮罩、侧边面板、焦点陷阱、Esc 关闭 |
| `src/client/components/NoteDrawer.tsx` | 改 | 改用 `ui/Drawer` |
| `src/client/components/NotificationCard.tsx` | 建 | 通知卡片（样式 B），toast / drawer 两种变体 |
| `src/client/components/NotificationStack.tsx` | 建 | 右上角弹出栈，带倒计时 |
| `src/client/components/NotificationDrawer.tsx` | 建 | 通知抽屉 |
| `src/client/components/NotificationBell.tsx` | 建 | 铃铛与未读角标 |
| `src/client/state/useFullscreen.ts` | 建 | 浏览器全屏 |
| `src/client/state/useHub.ts` | 改 | 事件 → `toNotifications` → `onNotify` |
| `src/client/components/TopBar.tsx` | 改 | 用 `SegmentedControl`，加全屏按钮和铃铛 |
| `src/client/App.tsx` | 改 | 接线 |
| `src/client/styles/index.css` | 改 | 新增 `toast-timer` 动画 |
| `tests/server/store.test.ts` | 改 | `diffNotes` |
| `tests/e2e/live-sync.test.ts` | 改 | `changes`、`at` 端到端 |
| `tests/client/theme.test.ts` | 改 | 去掉轮换测试 |
| `tests/client/segmented-control.test.tsx` | 建 | |
| `tests/client/format.test.ts` | 建 | |
| `tests/client/notifications-derive.test.ts` | 建 | |
| `tests/client/notifications-store.test.ts` | 建 | |
| `tests/client/notification-card.test.tsx` | 建 | 卡片、铃铛 |
| `docs/superpowers/specs/2026-10-12-modern-ui-design-system.md` | 改 | 通用组件表补 `SegmentedControl`、`Drawer` |

---

### 任务 0：准备环境

**文件：** 无代码改动

- [ ] **步骤 1：确认分支**

运行：`git log --oneline -2`
预期：第一行是 `docs: 变更通知、主题分段切换与全屏的设计规格`，第二行是 `f3a984d feat: 迁移到 Vite，并按新设计系统重做界面`。

- [ ] **步骤 2：把主检出目录的 `node_modules` 接进 worktree**

worktree 位于 OneDrive 内，不要在这里另装一份 `node_modules`（会产生大量同步流量，见 README）。主检出目录和本分支的 `package.json` 相同，直接建目录联接即可：

运行：`cmd //c mklink /J node_modules "D:\OneDrive\Project Files\Engineering Decision Management\node_modules"`
预期：`为 node_modules <<===>> ... 创建的联接`。`node_modules/` 已经在 `.gitignore` 里。

- [ ] **步骤 3：跑一遍基线**

运行：`bun test 2>&1 | tail -5` 和 `bun run typecheck`
预期：全部通过、类型检查无输出。如果基线就有失败，先记录下来，不要在本计划里修。

---

### 任务 1：共享类型与 `diffNotes`

**文件：**
- 修改：`src/shared/types.ts`（`ProjectUpdatedEvent` / `ProjectErrorEvent` 一段）
- 修改：`src/server/store.ts`（文件末尾追加）
- 测试：`tests/server/store.test.ts`

- [ ] **步骤 1：加类型**

在 `src/shared/types.ts` 中，把

```ts
export type ConnectedEvent = { clientId: string };
export type ProjectUpdatedEvent = {
  id: string;
  count: number;
  delta: number;
  scanMs: number;
  at: number;
  project: ProjectMeta;
};
export type ConfigChangedEvent = { projects: ProjectMeta[] };
export type ProjectErrorEvent = { id: string; reason: string };
```

替换为

```ts
/** 两次扫描之间单篇笔记的变化。moved 的 id 是新 id（打开笔记用），fromId 是旧 id */
export type NoteChange =
  | { kind: 'added' | 'modified' | 'removed'; id: string; title: string; lifecycle: Lifecycle }
  | { kind: 'moved'; id: string; fromId: string; title: string; from: Lifecycle; to: Lifecycle };

export type ConnectedEvent = { clientId: string };
export type ProjectUpdatedEvent = {
  id: string;
  count: number;
  delta: number;
  scanMs: number;
  at: number;
  project: ProjectMeta;
  /** 与上一次扫描相比的笔记变化；首次扫描、从失效恢复、无变化时不带 */
  changes?: NoteChange[];
};
export type ConfigChangedEvent = { projects: ProjectMeta[] };
/** at：服务端时间戳，前端据此生成确定性通知 id（多个标签页去重） */
export type ProjectErrorEvent = { id: string; reason: string; at: number };
```

- [ ] **步骤 2：写失败的测试**

在 `tests/server/store.test.ts` 顶部的 import 里加上 `diffNotes`：

```ts
import {
  applyScan,
  computeInCount,
  countLifecycles,
  createIndex,
  diffNotes,
  latestNoteDateMs,
  markUnhealthy,
  sameNotes,
  toMeta,
  toSummary,
} from '../../src/server/store';
```

在文件末尾追加（复用文件里已有的 `doc()` 工厂；它把 `title` 设为 id、`hash` 设为 `'0'`）：

```ts
describe('diffNotes', () => {
  const withHash = (id: string, hash: string, title = id): NoteDoc => ({ ...doc(id), hash, title });

  test('无变化时返回空数组', () => {
    const notes = [doc('implemented/a/x.md'), doc('proposed/a/y.md')];
    expect(diffNotes(notes, notes)).toEqual([]);
  });

  test('识别新增、修改、删除', () => {
    const prev = [withHash('implemented/a/keep.md', '1'), withHash('implemented/a/edit.md', '1'), withHash('implemented/a/gone.md', '1')];
    const next = [withHash('implemented/a/keep.md', '1'), withHash('implemented/a/edit.md', '2'), withHash('proposed/b/new.md', '1')];
    expect(diffNotes(prev, next)).toEqual([
      { kind: 'added', id: 'proposed/b/new.md', title: 'proposed/b/new.md', lifecycle: 'proposed' },
      { kind: 'modified', id: 'implemented/a/edit.md', title: 'implemented/a/edit.md', lifecycle: 'implemented' },
      { kind: 'removed', id: 'implemented/a/gone.md', title: 'implemented/a/gone.md', lifecycle: 'implemented' },
    ]);
  });

  test('换了生命周期目录的同名笔记记为一次迁移，内容同时改了也只记一条', () => {
    const prev = [withHash('proposed/feature/2026-01-01-x.md', '1', 'X')];
    const next = [withHash('implemented/feature/2026-01-01-x.md', '2', 'X 改')];
    expect(diffNotes(prev, next)).toEqual([
      {
        kind: 'moved',
        id: 'implemented/feature/2026-01-01-x.md',
        fromId: 'proposed/feature/2026-01-01-x.md',
        title: 'X 改',
        from: 'proposed',
        to: 'implemented',
      },
    ]);
  });

  test('同一去首段 id 有多个候选时按完整 id 码点序配对，多出来的仍记为删除', () => {
    const prev = [doc('rejected/a/x.md'), doc('proposed/a/x.md')];
    const next = [doc('implemented/a/x.md')];
    expect(diffNotes(prev, next)).toEqual([
      { kind: 'moved', id: 'implemented/a/x.md', fromId: 'proposed/a/x.md', title: 'implemented/a/x.md', from: 'proposed', to: 'implemented' },
      { kind: 'removed', id: 'rejected/a/x.md', title: 'rejected/a/x.md', lifecycle: 'rejected' },
    ]);
  });

  test('不同分类目录下的同名文件不算迁移', () => {
    const changes = diffNotes([doc('proposed/a/x.md')], [doc('implemented/b/x.md')]);
    expect(changes.map((c) => c.kind)).toEqual(['added', 'removed']);
  });

  test('输出按 迁移 → 新增 → 修改 → 删除 排序，组内按标题', () => {
    const prev = [withHash('implemented/a/m.md', '1', 'M'), doc('proposed/a/mv.md'), withHash('implemented/a/z.md', '1', 'Z'), withHash('implemented/a/b.md', '1', 'B')];
    const next = [
      withHash('implemented/a/m.md', '2', 'M'),
      doc('implemented/a/mv.md'),
      withHash('proposed/a/y.md', '1', 'Y'),
      withHash('proposed/a/c.md', '1', 'C'),
    ];
    expect(diffNotes(prev, next).map((c) => `${c.kind}:${c.title}`)).toEqual([
      'moved:implemented/a/mv.md',
      'added:C',
      'added:Y',
      'modified:M',
      'removed:B',
      'removed:Z',
    ]);
  });
});
```

- [ ] **步骤 3：运行测试验证失败**

运行：`bun test tests/server/store.test.ts`
预期：FAIL，报 `diffNotes` 不存在（export not found）。

- [ ] **步骤 4：实现 `diffNotes`**

在 `src/server/store.ts` 顶部的类型 import 里加入 `NoteChange`：

```ts
import {
  LIFECYCLES,
  type LifecycleCounts,
  type NoteChange,
  type NoteDoc,
  type NoteSummary,
  type ProjectMeta,
  type ProjectSource,
  type WatchMode,
} from '../shared/types';
```

在文件末尾追加：

```ts
/** 码点序比较，结果与运行时 / 区域设置无关 */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 去掉首段生命周期目录：implemented/feature/x.md → feature/x.md，用来识别状态迁移 */
function withoutLifecycle(id: string): string {
  return id.slice(id.indexOf('/') + 1);
}

const CHANGE_ORDER: Record<NoteChange['kind'], number> = { moved: 0, added: 1, modified: 2, removed: 3 };

/**
 * 两次扫描之间的笔记变化。
 * 新增与删除里去掉首段后 id 相同的配成一次迁移（同一去首段 id 有多个候选时按完整 id 码点序依次配对）；
 * 迁移同时内容也改了，只记一条 moved。输出按 迁移 → 新增 → 修改 → 删除，组内按标题、再按 id 排序。
 */
export function diffNotes(prev: readonly NoteDoc[], next: readonly NoteDoc[]): NoteChange[] {
  const prevById = new Map(prev.map((n) => [n.id, n]));
  const nextById = new Map(next.map((n) => [n.id, n]));
  const byId = (a: NoteDoc, b: NoteDoc) => byCodePoint(a.id, b.id);
  const added = next.filter((n) => !prevById.has(n.id)).sort(byId);
  const removed = prev.filter((n) => !nextById.has(n.id)).sort(byId);

  const removedByRest = new Map<string, NoteDoc[]>();
  for (const n of removed) {
    const rest = withoutLifecycle(n.id);
    removedByRest.set(rest, [...(removedByRest.get(rest) ?? []), n]);
  }

  const changes: NoteChange[] = [];
  const paired = new Set<string>();
  for (const n of added) {
    const from = removedByRest.get(withoutLifecycle(n.id))?.find((c) => !paired.has(c.id));
    if (from) {
      paired.add(from.id);
      changes.push({ kind: 'moved', id: n.id, fromId: from.id, title: n.title, from: from.lifecycle, to: n.lifecycle });
    } else {
      changes.push({ kind: 'added', id: n.id, title: n.title, lifecycle: n.lifecycle });
    }
  }
  for (const n of next) {
    const old = prevById.get(n.id);
    if (old && old.hash !== n.hash) changes.push({ kind: 'modified', id: n.id, title: n.title, lifecycle: n.lifecycle });
  }
  for (const n of removed) {
    if (!paired.has(n.id)) changes.push({ kind: 'removed', id: n.id, title: n.title, lifecycle: n.lifecycle });
  }

  return changes.sort(
    (a, b) => CHANGE_ORDER[a.kind] - CHANGE_ORDER[b.kind] || byCodePoint(a.title, b.title) || byCodePoint(a.id, b.id),
  );
}
```

- [ ] **步骤 5：运行测试验证通过**

运行：`bun test tests/server/store.test.ts`
预期：PASS。

- [ ] **步骤 6：类型检查**

运行：`bun run typecheck`
预期：只在 `src/server/hub.ts` 报 `project-error` 广播缺少 `at`（任务 2 修复），没有其他错误。

本任务不单独 commit：要等任务 2 补上 `at` 后类型检查才能通过，所以和任务 2 合并成一次提交（见任务 2 步骤 6）。

---

### 任务 2：服务端附带 `changes` 与 `at`

**文件：**
- 修改：`src/server/hub.ts`（import 行，`scanNow` 里的 `project-updated` 广播，`scanNow` 的 catch 分支，`degrade`）
- 测试：`tests/e2e/live-sync.test.ts`

- [ ] **步骤 1：写失败的测试**

在 `tests/e2e/live-sync.test.ts` 中：

1. 第一行 import 改为 `import { afterEach, expect, test } from 'bun:test';`（不变），第二行的 fs import 加上 `renameSync`：

```ts
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
```

类型 import 加上 `ProjectErrorEvent`：

```ts
import type { ConfigResponse, NotesResponse, ProjectErrorEvent, ProjectUpdatedEvent } from '../../src/shared/types';
```

2. 在第一个用例「写入笔记 → SSE 收到 project-updated …」中，`expect((added.data as ProjectUpdatedEvent).project.counts.proposed).toBe(1);` 之后加：

```ts
  expect((added.data as ProjectUpdatedEvent).changes).toEqual([
    { kind: 'added', id: 'proposed/architecture/2026-10-12-new.md', title: '新提案', lifecycle: 'proposed' },
  ]);
```

`expect((removed.data as ProjectUpdatedEvent).delta).toBe(-1);` 之后加：

```ts
  expect((removed.data as ProjectUpdatedEvent).changes).toEqual([
    { kind: 'removed', id: 'proposed/architecture/2026-10-12-new.md', title: '新提案', lifecycle: 'proposed' },
  ]);
```

3. 在「文件事件触发的扫描更新 lastChangeAt」用例中，`expect((data as ProjectUpdatedEvent).project.lastChangeAt)...` 之后加：

```ts
  expect((data as ProjectUpdatedEvent).changes).toEqual([
    { kind: 'modified', id: 'implemented/feature/2026-01-01-a.md', title: 'a 改', lifecycle: 'implemented' },
  ]);
```

4. 把「定期重扫扫描根发现新项目并广播 config-changed」用例里的

```ts
  const { data } = await waitForEvent(reader, (event) => event === 'config-changed', 4000);
```

替换为（新项目的首次扫描先于 `config-changed` 广播，且不带 `changes`）：

```ts
  const initial = await waitForEvent(
    reader,
    (event, data) => event === 'project-updated' && (data as ProjectUpdatedEvent).id === 'Second',
    4000,
  );
  expect((initial.data as ProjectUpdatedEvent).changes).toBeUndefined();
  const { data } = await waitForEvent(reader, (event) => event === 'config-changed', 4000);
```

5. 把「notes 目录被删后项目变为失效 + 手动刷新…」用例整体替换为：

```ts
test('notes 目录被删后项目变为失效 + 手动刷新；恢复后的手动重扫不带 changes', async () => {
  env = await startTestServer((root) => makeProject(root, 'Gone', { 'implemented/feature/2026-01-01-a.md': note('a') }));
  const reader = await openEvents(env.base);
  const before = Date.now();
  rmSync(join(env.root, 'Gone', '.agents', 'notes'), { recursive: true, force: true });
  const error = await waitForEvent(reader, (event, data) => event === 'project-error' && (data as { id: string }).id === 'Gone', 5000);
  expect((error.data as ProjectErrorEvent).at).toBeGreaterThanOrEqual(before);
  const config = (await (await fetch(`${env.base}/api/config`)).json()) as ConfigResponse;
  expect(config.projects.find((p) => p.id === 'Gone')).toMatchObject({ healthy: false, watchMode: 'manual', count: 0 });

  makeProject(env.root, 'Gone', { 'implemented/feature/2026-01-01-a.md': note('a') });
  await fetch(`${env.base}/api/projects/Gone/rescan`, { method: 'POST' });
  const recovered = await waitForEvent(
    reader,
    (event, data) => event === 'project-updated' && (data as ProjectUpdatedEvent).id === 'Gone',
    5000,
  );
  expect((recovered.data as ProjectUpdatedEvent).project).toMatchObject({ healthy: true, watchMode: 'live', count: 1 });
  expect((recovered.data as ProjectUpdatedEvent).changes).toBeUndefined();
  await reader.cancel();
});
```

6. 在文件末尾追加迁移用例：

```ts
test('把笔记从 proposed 移到 implemented → changes 里是一条 moved', async () => {
  env = await startTestServer((root) =>
    makeProject(root, 'Move', { 'proposed/feature/2026-01-01-a.md': note('a', 'proposed'), 'implemented/feature/.keep.md': '' }),
  );
  const notesRoot = join(env.root, 'Move', '.agents', 'notes');
  const reader = await openEvents(env.base);
  renameSync(join(notesRoot, 'proposed', 'feature', '2026-01-01-a.md'), join(notesRoot, 'implemented', 'feature', '2026-01-01-a.md'));
  const { data } = await waitForEvent(
    reader,
    (event, d) => event === 'project-updated' && (d as ProjectUpdatedEvent).project.counts.implemented === 1,
    5000,
  );
  expect((data as ProjectUpdatedEvent).changes).toEqual([
    {
      kind: 'moved',
      id: 'implemented/feature/2026-01-01-a.md',
      fromId: 'proposed/feature/2026-01-01-a.md',
      title: 'a',
      from: 'proposed',
      to: 'implemented',
    },
  ]);
  await reader.cancel();
});
```

（`.keep.md` 以 `.` 开头，扫描时会被跳过，作用只是预先建好 `implemented/feature` 目录。笔记正文里的 `Status: proposed` 与所在目录不一致不影响结果，生命周期以目录为准。）

- [ ] **步骤 2：运行测试验证失败**

运行：`bun test tests/e2e/live-sync.test.ts`
预期：FAIL。新增的 `changes` 断言收到 `undefined`，`at` 断言收到 `undefined`。

- [ ] **步骤 3：实现**

`src/server/hub.ts` 第 8 行的 import 加入 `diffNotes`：

```ts
import { applyScan, createIndex, diffNotes, markUnhealthy, sameNotes, toMeta, toSummary, type ProjectIndex, type ScanCause } from './store';
```

`scanNow` 中把

```ts
      this.projects.set(id, applyScan(current, notes, scanMs, cause, Date.now()));
      if (cause === 'manual') this.startWatch(id);
      const next = this.projects.get(id)!;
      this.events.broadcast('project-updated', {
        id,
        count: notes.length,
        delta: notes.length - current.notes.length,
        scanMs,
        at: next.scannedAt,
        project: toMeta(next),
      });
      return next;
```

替换为

```ts
      // 首次扫描的旧列表本来就空；失效时 markUnhealthy 清空了 notes。这两种情况算 diff 会把全部笔记当成「新增」
      const changes = cause !== 'initial' && current.healthy ? diffNotes(current.notes, notes) : [];
      this.projects.set(id, applyScan(current, notes, scanMs, cause, Date.now()));
      if (cause === 'manual') this.startWatch(id);
      const next = this.projects.get(id)!;
      this.events.broadcast('project-updated', {
        id,
        count: notes.length,
        delta: notes.length - current.notes.length,
        scanMs,
        at: next.scannedAt,
        project: toMeta(next),
        ...(changes.length > 0 ? { changes } : {}),
      });
      return next;
```

`scanNow` 的 catch 分支里把

```ts
      this.events.broadcast('project-error', { id, reason });
```

替换为

```ts
      this.events.broadcast('project-error', { id, reason, at: Date.now() });
```

`degrade` 里把

```ts
    this.events.broadcast('project-error', { id, reason: `实时监听不可用，已切换为手动刷新：${err.message}` });
```

替换为

```ts
    this.events.broadcast('project-error', { id, reason: `实时监听不可用，已切换为手动刷新：${err.message}`, at: Date.now() });
```

- [ ] **步骤 4：运行测试验证通过**

运行：`bun test tests/e2e/live-sync.test.ts tests/server`
预期：PASS。如果迁移用例偶发拿到 `added` 和 `removed` 两次事件（rename 的两个文件事件被拆进了两次扫描），说明测试服务的 `debounceMs: 50` 在这台机器上不够，把这个用例的 `startTestServer` 第二个参数设为 `{ watch: { debounceMs: 200, rescanRootsMs: 0 } }` 后重跑。

- [ ] **步骤 5：类型检查**

运行：`bun run typecheck`
预期：无输出。

- [ ] **步骤 6：Commit**

```bash
git add src/shared/types.ts src/server/store.ts src/server/hub.ts tests/server/store.test.ts tests/e2e/live-sync.test.ts
git commit -m "feat: project-updated 附带笔记变更明细（新增 / 修改 / 迁移 / 删除），project-error 带时间戳"
```

---

### 任务 3：`SegmentedControl` 通用组件

**文件：**
- 创建：`src/client/ui/SegmentedControl.tsx`
- 测试：`tests/client/segmented-control.test.tsx`

- [ ] **步骤 1：写失败的测试**

创建 `tests/client/segmented-control.test.tsx`：

```tsx
import { expect, test } from 'bun:test';
import { Monitor, Moon, Sun } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SegmentedControl, type SegmentOption } from '../../src/client/ui/SegmentedControl';

type Pref = 'system' | 'light' | 'dark';
const OPTIONS: readonly SegmentOption<Pref>[] = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
];
const noop = () => {};

test('radio 模式：radiogroup + aria-checked，只有选中项可 Tab 聚焦', () => {
  const html = renderToStaticMarkup(<SegmentedControl mode="radio" label="主题" value="light" options={OPTIONS} onChange={noop} iconOnly />);
  expect(html).toContain('role="radiogroup"');
  expect(html).toContain('aria-label="主题"');
  expect(html.match(/role="radio"/g)).toHaveLength(3);
  expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  expect(html).toMatch(/data-value="light"[^>]*tabindex="0"|tabindex="0"[^>]*data-value="light"/);
  expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
  expect(html).not.toContain('aria-current');
});

test('只显示图标时文字仍在 sr-only 里，并作为 title', () => {
  const html = renderToStaticMarkup(<SegmentedControl mode="radio" label="主题" value="system" options={OPTIONS} onChange={noop} iconOnly />);
  expect(html).toContain('title="跟随系统"');
  expect(html).toContain('<span class="sr-only">跟随系统</span>');
});

test('nav 模式：navigation + aria-current，不带 radio 语义', () => {
  const html = renderToStaticMarkup(<SegmentedControl mode="nav" label="视图" value="dark" options={OPTIONS} onChange={noop} iconOnly="below-lg" />);
  expect(html).toContain('role="navigation"');
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).not.toContain('role="radio"');
  expect(html).toContain('max-lg:sr-only');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`bun test tests/client/segmented-control.test.tsx`
预期：FAIL，找不到模块 `src/client/ui/SegmentedControl`。

- [ ] **步骤 3：实现**

创建 `src/client/ui/SegmentedControl.tsx`（滑动底板的测量逻辑原样取自 `TopBar.tsx` 的 `ViewTabs`）：

```tsx
import type { LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from './tw';

export type SegmentOption<T extends string> = { value: T; label: string; icon: LucideIcon };

export type SegmentedControlProps<T extends string> = {
  /** nav：页面导航（aria-current）；radio：单选（radiogroup + 方向键） */
  mode: 'nav' | 'radio';
  /** 整组的可访问名称 */
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  /** true：始终只显示图标；'below-lg'：lg 以下只显示图标。文字都会保留给读屏与 title */
  iconOnly?: boolean | 'below-lg';
  className?: string;
};

const NEXT_KEYS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** 分段控件：一块滑动的底板跟随选中项，宽度随文字变化 */
export function SegmentedControl<T extends string>({
  mode,
  label,
  value,
  options,
  onChange,
  iconOnly = false,
  className,
}: SegmentedControlProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const radio = mode === 'radio';

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[data-active="true"]');
      if (active) setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value]);

  // radio 组内用方向键移动并立即选中（WAI-ARIA radio group 约定），焦点跟着走
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = NEXT_KEYS[e.key];
    if (!radio || !step) return;
    e.preventDefault();
    const index = options.findIndex((o) => o.value === value);
    const next = options[(index + step + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    listRef.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role={radio ? 'radiogroup' : 'navigation'}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('relative flex shrink-0 rounded-[10px] bg-surface-2 p-0.5 ring-1 ring-line ring-inset', className)}
    >
      {pill && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0.5 left-0 rounded-lg bg-surface shadow-raised ring-1 ring-line transition-[transform,width] duration-300 ease-out"
          style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
        />
      )}
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.value === value;
        const semantics = radio
          ? { role: 'radio' as const, 'aria-checked': active, tabIndex: active ? 0 : -1 }
          : { 'aria-current': active ? ('page' as const) : undefined };
        return (
          <button
            key={o.value}
            type="button"
            data-value={o.value}
            data-active={active}
            title={o.label}
            onClick={() => onChange(o.value)}
            {...semantics}
            className={cn(
              'relative z-10 inline-flex h-8 items-center gap-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors',
              iconOnly === true ? 'w-8 justify-center' : 'px-3',
              active ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            <Icon aria-hidden="true" className={cn('size-4 transition-colors', active && 'text-accent-text')} />
            <span className={cn(iconOnly === true && 'sr-only', iconOnly === 'below-lg' && 'max-lg:sr-only')}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`bun test tests/client/segmented-control.test.tsx`
预期：PASS。如果第一个用例的 `tabindex` 正则因属性顺序不匹配，用 `console.log(html)` 看实际输出，把正则改成和实际顺序一致（断言含义不能变：`light` 那个按钮的 `tabindex` 是 `0`）。

- [ ] **步骤 5：Commit**

```bash
git add src/client/ui/SegmentedControl.tsx tests/client/segmented-control.test.tsx
git commit -m "feat: 从视图标签抽出通用 SegmentedControl，支持 nav 与 radio 两种语义"
```

---

### 任务 4：主题改为三段单选，视图切换改用 `SegmentedControl`

**文件：**
- 修改：`src/client/theme.ts`
- 修改：`src/client/labels.ts`、`src/client/icons.ts`
- 修改：`src/client/components/TopBar.tsx`
- 修改：`src/client/App.tsx`
- 测试：`tests/client/theme.test.ts`

- [ ] **步骤 1：改测试**

在 `tests/client/theme.test.ts` 中，import 行改为

```ts
import { readPreference, resolveTheme, THEME_PREFERENCES, writePreference } from '../../src/client/theme';
```

把用例「偏好按 跟随系统 → 浅色 → 深色 轮换并回到起点」整体替换为

```ts
test('三个主题选项按 跟随系统 / 浅色 / 深色 排列', () => {
  expect(THEME_PREFERENCES).toEqual(['system', 'light', 'dark']);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`bun test tests/client/theme.test.ts`
预期：FAIL，`THEME_PREFERENCES` 未导出。

- [ ] **步骤 3：改 `theme.ts`**

把

```ts
const STORAGE_KEY = 'edm-theme';
const ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];
```

替换为

```ts
const STORAGE_KEY = 'edm-theme';
/** 顶栏分段与命令面板的排列顺序 */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];
```

删除整个 `nextPreference` 函数（连同上方注释 `/** 跟随系统 → 浅色 → 深色 → 跟随系统 */`）。

把文件末尾的 `useTheme` 整体替换为

```ts
export function setPreference(next: ThemePreference): void {
  writePreference(next);
  emit();
}

export function useTheme(): {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
} {
  const preference = useSyncExternalStore(subscribe, readPreference, () => 'system' as const);
  return { preference, setPreference };
}
```

文件顶部的 `import { useCallback, useSyncExternalStore } from 'react';` 改为 `import { useSyncExternalStore } from 'react';`。

- [ ] **步骤 4：加标签与图标**

`src/client/labels.ts` 顶部 import 改为

```ts
import type { Lifecycle } from '../shared/types';
import type { ThemePreference } from './theme';
import type { Tone } from './ui/Badge';
```

在 `STATUS_LABELS` 之后追加

```ts
export const THEME_LABELS: Record<ThemePreference, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};
```

`src/client/icons.ts` 改为

```ts
// 界面图标统一出口（lucide），不使用 emoji：各平台 emoji 字形与对齐不一致。
import { ClipboardList, History, Landmark, Monitor, Moon, ShieldAlert, Sun, type LucideIcon } from 'lucide-react';
import type { ViewId } from './router';
import type { ThemePreference } from './theme';

export const VIEW_ICONS: Record<ViewId, LucideIcon> = {
  baseline: Landmark,
  timeline: History,
  alternatives: ShieldAlert,
  directory: ClipboardList,
};

export const THEME_ICONS: Record<ThemePreference, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};
```

（如果 `icons.ts` 里 `VIEW_ICONS` 之后还有别的导出，保留它们，只追加 `THEME_ICONS` 和新的 import 名。）

- [ ] **步骤 5：改 `TopBar.tsx`**

1. import 段替换为：

```tsx
import { Menu, RefreshCw, Search } from 'lucide-react';
import type { ProjectMeta } from '../../shared/types';
import { THEME_ICONS, VIEW_ICONS } from '../icons';
import { THEME_LABELS } from '../labels';
import { VIEW_LABELS, VIEWS, type ViewId } from '../router';
import type { SyncStatus } from '../state/useHub';
import { THEME_PREFERENCES, type ThemePreference } from '../theme';
import { Button } from '../ui/Button';
import { Kbd, MOD_KEY_LABEL } from '../ui/Kbd';
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl';
import { cn } from '../ui/tw';
```

2. `TopBarProps` 里把 `onCycleTheme: () => void;` 换成 `onThemeChange: (theme: ThemePreference) => void;`。

3. 删除 `THEME_META` 常量和整个 `ViewTabs` 函数（连同其上方注释），在原位置加：

```tsx
const VIEW_OPTIONS: readonly SegmentOption<ViewId>[] = VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v], icon: VIEW_ICONS[v] }));
const THEME_OPTIONS: readonly SegmentOption<ThemePreference>[] = THEME_PREFERENCES.map((p) => ({
  value: p,
  label: THEME_LABELS[p],
  icon: THEME_ICONS[p],
}));
```

4. `TopBar` 函数开头两行改为：

```tsx
  const { project, view, theme, railOpen, onViewChange, onOpenPalette, onToggleRail, onThemeChange } = props;
```

（删除 `const { icon: ThemeIcon, label: themeLabel } = THEME_META[theme];`。）

5. 把 `<ViewTabs view={view} onViewChange={onViewChange} />` 替换为：

```tsx
      <SegmentedControl mode="nav" label="视图" value={view} options={VIEW_OPTIONS} onChange={onViewChange} iconOnly="below-lg" />
```

6. 把主题按钮

```tsx
      <Button
        variant="ghost"
        size="icon"
        className="max-sm:hidden"
        title={`主题：${themeLabel}（点击切换）`}
        aria-label={`主题：${themeLabel}，点击切换`}
        onClick={onCycleTheme}
      >
        <ThemeIcon aria-hidden="true" />
      </Button>
```

替换为：

```tsx
      <SegmentedControl mode="radio" label="主题" value={theme} options={THEME_OPTIONS} onChange={onThemeChange} iconOnly className="max-sm:hidden" />
```

- [ ] **步骤 6：改 `App.tsx`**

1. 第一行 import 去掉 `Palette`：`import { Folder, FolderPlus, RefreshCw, ServerOff, WifiOff } from 'lucide-react';`
2. `import { VIEW_ICONS } from './icons';` 改为 `import { THEME_ICONS, VIEW_ICONS } from './icons';`，并新增 `import { THEME_LABELS } from './labels';`
3. `import { useTheme } from './theme';` 改为 `import { THEME_PREFERENCES, useTheme } from './theme';`
4. 删除常量 `const THEME_NAMES = { system: '跟随系统', light: '浅色', dark: '深色' } as const;`
5. `const { preference: theme, cycle: cycleTheme } = useTheme();` 改为 `const { preference: theme, setPreference: setTheme } = useTheme();`
6. `commands` 里把 `id: 'theme'` 那一项整体替换为：

```ts
      ...THEME_PREFERENCES.map((p) => ({
        id: `theme:${p}`,
        group: '外观',
        label: `主题：${THEME_LABELS[p]}`,
        hint: p === theme ? '当前' : undefined,
        icon: THEME_ICONS[p],
        keywords: 'theme dark light 主题 深色 浅色 跟随系统',
        run: () => setTheme(p),
      })),
```

依赖数组里的 `cycleTheme` 换成 `setTheme`。
7. `<TopBar ... onCycleTheme={cycleTheme} />` 换成 `onThemeChange={setTheme}`。

- [ ] **步骤 7：运行测试与类型检查**

运行：`bun test tests/client` 和 `bun run typecheck`
预期：全部 PASS，类型检查无输出（`grep -rn "cycle\|nextPreference\|THEME_META\|ViewTabs" src tests` 应无结果）。

- [ ] **步骤 8：Commit**

```bash
git add src/client/theme.ts src/client/labels.ts src/client/icons.ts src/client/components/TopBar.tsx src/client/App.tsx tests/client/theme.test.ts
git commit -m "feat: 主题切换改为三段单选，视图与主题共用 SegmentedControl；命令面板可直接选主题"
```

---

### 任务 5：时间格式化 `clockTime` / `dayGroup`

**文件：**
- 修改：`src/client/format.ts`（`relativeTime` 之后追加）
- 测试：`tests/client/format.test.ts`

- [ ] **步骤 1：写失败的测试**

创建 `tests/client/format.test.ts`（用本地时区构造时间，结果与运行机器时区无关）：

```ts
import { expect, test } from 'bun:test';
import { clockTime, dayGroup } from '../../src/client/format';

const at = (month: number, day: number, h: number, m: number) => new Date(2026, month - 1, day, h, m).getTime();
const NOW = at(10, 12, 15, 0);

test('今天只显示时分，其他日子带月日', () => {
  expect(clockTime(at(10, 12, 9, 5), NOW)).toBe('09:05');
  expect(clockTime(at(10, 11, 23, 59), NOW)).toBe('10月11日 23:59');
  expect(clockTime(at(1, 3, 0, 0), NOW)).toBe('1月3日 00:00');
});

test('按自然日分为 今天 / 昨天 / 更早', () => {
  expect(dayGroup(at(10, 12, 0, 0), NOW)).toBe('今天');
  expect(dayGroup(at(10, 11, 23, 59), NOW)).toBe('昨天');
  expect(dayGroup(at(10, 11, 0, 0), NOW)).toBe('昨天');
  expect(dayGroup(at(10, 10, 23, 59), NOW)).toBe('更早');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`bun test tests/client/format.test.ts`
预期：FAIL，`clockTime` 未导出。

- [ ] **步骤 3：实现**

在 `src/client/format.ts` 的 `relativeTime` 之后追加：

```ts
const pad2 = (n: number) => String(n).padStart(2, '0');

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 通知时间：今天「14:32」，其余「10月11日 14:32」 */
export function clockTime(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return startOfDay(ms) === startOfDay(now) ? hm : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

export type DayGroup = '今天' | '昨天' | '更早';

/** 按自然日分组；「昨天」取今天零点前一毫秒所在日，夏令时切换日也正确 */
export function dayGroup(ms: number, now = Date.now()): DayGroup {
  const today = startOfDay(now);
  if (ms >= today) return '今天';
  return ms >= startOfDay(today - 1) ? '昨天' : '更早';
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`bun test tests/client/format.test.ts`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/client/format.ts tests/client/format.test.ts
git commit -m "feat: 通知用的时刻与按天分组格式化"
```

---

### 任务 6：通知类型与 `derive.ts`

**文件：**
- 创建：`src/client/notifications/types.ts`
- 创建：`src/client/notifications/derive.ts`
- 测试：`tests/client/notifications-derive.test.ts`

- [ ] **步骤 1：建类型文件**

创建 `src/client/notifications/types.ts`：

```ts
import type { NoteChange } from '../../shared/types';

export type NotificationBody =
  | { type: 'changes'; changes: NoteChange[] }
  | { type: 'error'; reason: string }
  | { type: 'recovered' };

export type AppNotification = {
  /** 确定性 id：`${type}:${projectId}:${at}`。多个标签页各自收到同一事件时据此去重 */
  id: string;
  projectId: string;
  /** 产生时的快照：项目改名或被移除后，旧通知照常显示 */
  projectName: string;
  projectOrder: number;
  at: number;
  read: boolean;
  body: NotificationBody;
};
```

- [ ] **步骤 2：写失败的测试**

创建 `tests/client/notifications-derive.test.ts`：

```ts
import { describe, expect, test } from 'bun:test';
import type { NoteChange, ProjectMeta } from '../../src/shared/types';
import {
  changeLabel,
  groupByDay,
  notificationText,
  remainderText,
  summarize,
  toNotifications,
} from '../../src/client/notifications/derive';
import type { AppNotification } from '../../src/client/notifications/types';

function meta(over: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    id: 'P',
    path: '/p',
    displayName: '项目 P',
    source: 'discovered',
    hidden: false,
    healthy: true,
    watchMode: 'live',
    error: null,
    order: 2,
    count: 1,
    counts: { implemented: 1, proposed: 0, rejected: 0, archived: 0 },
    lastChangeAt: 0,
    scannedAt: 0,
    scanMs: 1,
    ...over,
  };
}

const added: NoteChange = { kind: 'added', id: 'implemented/a/x.md', title: 'X', lifecycle: 'implemented' };
const modified: NoteChange = { kind: 'modified', id: 'implemented/a/y.md', title: 'Y', lifecycle: 'implemented' };
const removed: NoteChange = { kind: 'removed', id: 'implemented/a/z.md', title: 'Z', lifecycle: 'implemented' };
const moved: NoteChange = { kind: 'moved', id: 'implemented/a/m.md', fromId: 'proposed/a/m.md', title: 'M', from: 'proposed', to: 'implemented' };

const updated = (project: ProjectMeta, changes?: NoteChange[], at = 1000) => ({
  name: 'project-updated' as const,
  data: { id: project.id, count: project.count, delta: 0, scanMs: 1, at, project, ...(changes ? { changes } : {}) },
});
const errored = (reason: string, at = 2000) => ({ name: 'project-error' as const, data: { id: 'P', reason, at } });
const NO_ERRORS: ReadonlyMap<string, string> = new Map();

describe('toNotifications', () => {
  test('带 changes 的更新生成一条变更通知，项目名与色序取快照', () => {
    const { notifications } = toNotifications(updated(meta(), [added]), meta(), NO_ERRORS);
    expect(notifications).toEqual([
      {
        id: 'changes:P:1000',
        projectId: 'P',
        projectName: '项目 P',
        projectOrder: 2,
        at: 1000,
        read: false,
        body: { type: 'changes', changes: [added] },
      },
    ]);
  });

  test('没有 changes 的更新不通知', () => {
    expect(toNotifications(updated(meta()), meta(), NO_ERRORS).notifications).toEqual([]);
    expect(toNotifications(updated(meta(), []), meta(), NO_ERRORS).notifications).toEqual([]);
  });

  test('隐藏项目一律不通知', () => {
    const hidden = meta({ hidden: true });
    expect(toNotifications(updated(hidden, [added]), hidden, NO_ERRORS).notifications).toEqual([]);
    expect(toNotifications(errored('坏了'), hidden, NO_ERRORS).notifications).toEqual([]);
  });

  test('从失效或手动刷新回到健康 + 实时监听时发一条已恢复，并清掉该项目的异常记录', () => {
    const errors = new Map([['P', '坏了']]);
    const fromBroken = toNotifications(updated(meta()), meta({ healthy: false, watchMode: 'manual' }), errors);
    expect(fromBroken.notifications.map((n) => n.body)).toEqual([{ type: 'recovered' }]);
    expect(fromBroken.notifications[0]!.id).toBe('recovered:P:1000');
    expect(fromBroken.lastErrors.has('P')).toBe(false);

    const fromManual = toNotifications(updated(meta()), meta({ watchMode: 'manual' }), NO_ERRORS);
    expect(fromManual.notifications.map((n) => n.body.type)).toEqual(['recovered']);
  });

  test('恢复与变更同时发生时两条都发，已恢复在前', () => {
    const { notifications } = toNotifications(updated(meta(), [added]), meta({ watchMode: 'manual' }), NO_ERRORS);
    expect(notifications.map((n) => n.body.type)).toEqual(['recovered', 'changes']);
  });

  test('仍不健康的更新不算恢复', () => {
    const still = meta({ healthy: false, watchMode: 'manual' });
    expect(toNotifications(updated(still), still, NO_ERRORS).notifications).toEqual([]);
  });

  test('异常：恢复前同一原因只通知一次，换了原因再通知', () => {
    const first = toNotifications(errored('坏了'), meta(), NO_ERRORS);
    expect(first.notifications.map((n) => [n.id, n.body])).toEqual([['error:P:2000', { type: 'error', reason: '坏了' }]]);
    expect(toNotifications(errored('坏了', 3000), meta(), first.lastErrors).notifications).toEqual([]);
    expect(toNotifications(errored('又坏了', 3000), meta(), first.lastErrors).notifications).toHaveLength(1);
  });

  test('前端还不认识的项目报异常时不通知', () => {
    expect(toNotifications(errored('坏了'), undefined, NO_ERRORS).notifications).toEqual([]);
  });

  test('不修改传入的 lastErrors', () => {
    const errors = new Map([['P', '坏了']]);
    toNotifications(updated(meta()), meta({ watchMode: 'manual' }), errors);
    toNotifications(errored('又坏了'), meta(), errors);
    expect([...errors]).toEqual([['P', '坏了']]);
  });
});

describe('文案', () => {
  test('迁移标签用状态中文名，其余用动作名', () => {
    expect(changeLabel(moved)).toBe('待评审 → 已落地');
    expect(changeLabel(added)).toBe('新增');
    expect(changeLabel(removed)).toBe('删除');
  });

  test('summarize 按 迁移 / 新增 / 修改 / 删除 列出非零项', () => {
    expect(summarize([modified, added, modified, moved])).toBe('迁移 1、新增 1、修改 2');
  });

  test('remainderText 汇总前 limit 处之后的部分；没有剩余返回 null', () => {
    expect(remainderText([moved, added, added, modified, removed], 3)).toBe('另有 1 处修改、1 处删除');
    expect(remainderText([added, modified], 3)).toBeNull();
  });

  test('notificationText 用于系统通知正文与读屏', () => {
    const base = { id: 'x', projectId: 'P', projectName: '项目 P', projectOrder: 0, at: 0, read: false };
    expect(notificationText({ ...base, body: { type: 'changes', changes: [added, modified] } })).toBe('新增 1、修改 1：X');
    expect(notificationText({ ...base, body: { type: 'error', reason: '路径失效' } })).toBe('路径失效');
    expect(notificationText({ ...base, body: { type: 'recovered' } })).toBe('实时监听已恢复');
  });
});

test('groupByDay 保持原顺序，按 今天 / 昨天 / 更早 分组并跳过空组', () => {
  const now = new Date(2026, 9, 12, 15, 0).getTime();
  const n = (id: string, at: number): AppNotification => ({
    id,
    projectId: 'P',
    projectName: 'P',
    projectOrder: 0,
    at,
    read: true,
    body: { type: 'recovered' },
  });
  const items = [n('a', new Date(2026, 9, 12, 14, 0).getTime()), n('b', new Date(2026, 9, 12, 9, 0).getTime()), n('c', new Date(2026, 9, 1).getTime())];
  expect(groupByDay(items, now).map(([label, list]) => [label, list.map((x) => x.id)])).toEqual([
    ['今天', ['a', 'b']],
    ['更早', ['c']],
  ]);
});
```

- [ ] **步骤 3：运行测试验证失败**

运行：`bun test tests/client/notifications-derive.test.ts`
预期：FAIL，找不到模块 `src/client/notifications/derive`。

- [ ] **步骤 4：实现**

创建 `src/client/notifications/derive.ts`：

```ts
import type { NoteChange, ProjectErrorEvent, ProjectMeta, ProjectUpdatedEvent } from '../../shared/types';
import { dayGroup, type DayGroup } from '../format';
import { STATUS_LABELS } from '../labels';
import type { Tone } from '../ui/Badge';
import type { AppNotification, NotificationBody } from './types';

export type HubNotifyEvent =
  | { name: 'project-updated'; data: ProjectUpdatedEvent }
  | { name: 'project-error'; data: ProjectErrorEvent };

export type DeriveResult = {
  notifications: AppNotification[];
  /** 每个项目最近一次已通知的异常原因；恢复时清掉。返回新 Map，不改入参 */
  lastErrors: ReadonlyMap<string, string>;
};

type ChangeKind = NoteChange['kind'];
const KIND_ORDER: readonly ChangeKind[] = ['moved', 'added', 'modified', 'removed'];

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = { moved: '迁移', added: '新增', modified: '修改', removed: '删除' };
export const CHANGE_TONES: Record<ChangeKind, Tone> = { moved: 'purple', added: 'emerald', modified: 'blue', removed: 'rose' };

function make(project: ProjectMeta, at: number, body: NotificationBody): AppNotification {
  return {
    id: `${body.type}:${project.id}:${at}`,
    projectId: project.id,
    projectName: project.displayName,
    projectOrder: project.order,
    at,
    read: false,
    body,
  };
}

const isLive = (p: ProjectMeta) => p.healthy && p.watchMode === 'live';

/**
 * SSE 事件 → 通知。prevMeta 是收到事件前前端已知的该项目元数据。
 * 隐藏项目不通知；同一项目恢复前重复出现相同原因的异常只通知一次。
 */
export function toNotifications(
  event: HubNotifyEvent,
  prevMeta: ProjectMeta | undefined,
  lastErrors: ReadonlyMap<string, string>,
): DeriveResult {
  if (event.name === 'project-error') {
    const { id, reason, at } = event.data;
    if (!prevMeta || prevMeta.hidden || lastErrors.get(id) === reason) return { notifications: [], lastErrors };
    return { notifications: [make(prevMeta, at, { type: 'error', reason })], lastErrors: new Map(lastErrors).set(id, reason) };
  }

  const { project, changes, at } = event.data;
  if (project.hidden) return { notifications: [], lastErrors };
  const notifications: AppNotification[] = [];
  let errors = lastErrors;
  if (prevMeta && !isLive(prevMeta) && isLive(project)) {
    notifications.push(make(project, at, { type: 'recovered' }));
    const next = new Map(lastErrors);
    next.delete(project.id);
    errors = next;
  }
  if (changes && changes.length > 0) notifications.push(make(project, at, { type: 'changes', changes }));
  return { notifications, lastErrors: errors };
}

export function changeLabel(change: NoteChange): string {
  return change.kind === 'moved' ? `${STATUS_LABELS[change.from]} → ${STATUS_LABELS[change.to]}` : CHANGE_KIND_LABELS[change.kind];
}

function countByKind(changes: readonly NoteChange[]): [ChangeKind, number][] {
  return KIND_ORDER.map((kind): [ChangeKind, number] => [kind, changes.filter((c) => c.kind === kind).length]).filter(([, n]) => n > 0);
}

/** 「迁移 1、新增 1、修改 2」 */
export function summarize(changes: readonly NoteChange[]): string {
  return countByKind(changes)
    .map(([kind, n]) => `${CHANGE_KIND_LABELS[kind]} ${n}`)
    .join('、');
}

/** 卡片只列前 limit 处时末尾的「另有 1 处修改、1 处删除」；没有剩余返回 null */
export function remainderText(changes: readonly NoteChange[], limit: number): string | null {
  const rest = changes.slice(limit);
  if (rest.length === 0) return null;
  return `另有 ${countByKind(rest)
    .map(([kind, n]) => `${n} 处${CHANGE_KIND_LABELS[kind]}`)
    .join('、')}`;
}

/** 一句话描述：系统通知正文、卡片的可访问名称 */
export function notificationText(n: AppNotification): string {
  switch (n.body.type) {
    case 'changes':
      return `${summarize(n.body.changes)}：${n.body.changes[0]?.title ?? ''}`;
    case 'error':
      return n.body.reason;
    case 'recovered':
      return '实时监听已恢复';
  }
}

/** 按 今天 / 昨天 / 更早 分组，保持传入顺序（新的在前），跳过空组 */
export function groupByDay(items: readonly AppNotification[], now: number): [DayGroup, AppNotification[]][] {
  const groups = new Map<DayGroup, AppNotification[]>();
  for (const n of items) {
    const label = dayGroup(n.at, now);
    groups.set(label, [...(groups.get(label) ?? []), n]);
  }
  return (['今天', '昨天', '更早'] as const).flatMap((label): [DayGroup, AppNotification[]][] => {
    const list = groups.get(label);
    return list ? [[label, list]] : [];
  });
}
```

- [ ] **步骤 5：运行测试验证通过**

运行：`bun test tests/client/notifications-derive.test.ts`
预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add src/client/notifications/types.ts src/client/notifications/derive.ts tests/client/notifications-derive.test.ts
git commit -m "feat: SSE 事件转通知（变更 / 异常 / 已恢复），附摘要文案与按天分组"
```

---

### 任务 7：通知 store

**文件：**
- 创建：`src/client/notifications/store.ts`
- 测试：`tests/client/notifications-store.test.ts`

- [ ] **步骤 1：写失败的测试**

创建 `tests/client/notifications-store.test.ts`（`localStorage` 替身写法与 `theme.test.ts` 相同）：

```ts
import { afterEach, beforeEach, expect, test } from 'bun:test';
import {
  clearNotifications,
  dismissNotification,
  markAllRead,
  MAX_NOTIFICATIONS,
  pushNotifications,
  readNotifications,
} from '../../src/client/notifications/store';
import type { AppNotification } from '../../src/client/notifications/types';

const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function stubStorage(broken = false) {
  const data = new Map<string, string>();
  const fail = () => {
    if (broken) throw new Error('storage disabled');
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (fail(), data.get(k) ?? null),
      setItem: (k: string, v: string) => (fail(), void data.set(k, v)),
      removeItem: (k: string) => (fail(), void data.delete(k)),
    },
  });
  return data;
}

const n = (id: string, at = 0): AppNotification => ({
  id,
  projectId: 'P',
  projectName: 'P',
  projectOrder: 0,
  at,
  read: false,
  body: { type: 'recovered' },
});

beforeEach(() => {
  stubStorage();
  clearNotifications();
});

afterEach(() => {
  stubStorage();
  clearNotifications(); // 清掉模块里的内存兜底
  if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

test('新通知排在最前，返回真正新增的那些；重复 id 被忽略', () => {
  expect(pushNotifications([n('a')]).map((x) => x.id)).toEqual(['a']);
  expect(pushNotifications([n('b'), n('a')]).map((x) => x.id)).toEqual(['b']);
  expect(readNotifications().map((x) => x.id)).toEqual(['b', 'a']);
  expect(pushNotifications([n('a')])).toEqual([]);
});

test('写入 localStorage 并能读回（模拟刷新页面）', () => {
  const data = stubStorage();
  pushNotifications([n('a', 5)]);
  expect(JSON.parse(data.get('edm-notifications')!)).toEqual([n('a', 5)]);
});

test(`最多保留 ${MAX_NOTIFICATIONS} 条，超出时丢弃最旧的`, () => {
  pushNotifications(Array.from({ length: MAX_NOTIFICATIONS }, (_, i) => n(`old-${i}`)));
  pushNotifications([n('new')]);
  const items = readNotifications();
  expect(items).toHaveLength(MAX_NOTIFICATIONS);
  expect(items[0]!.id).toBe('new');
  expect(items.at(-1)!.id).toBe(`old-${MAX_NOTIFICATIONS - 2}`);
});

test('单条清除与全部清除', () => {
  pushNotifications([n('a'), n('b')]);
  dismissNotification('a');
  expect(readNotifications().map((x) => x.id)).toEqual(['b']);
  clearNotifications();
  expect(readNotifications()).toEqual([]);
});

test('全部已读', () => {
  pushNotifications([n('a'), n('b')]);
  markAllRead();
  expect(readNotifications().every((x) => x.read)).toBe(true);
});

test('没有变化时快照引用不变（useSyncExternalStore 依赖这一点）', () => {
  pushNotifications([n('a')]);
  expect(readNotifications()).toBe(readNotifications());
});

test('localStorage 里是损坏的 JSON 或非数组时当作空列表', () => {
  const data = stubStorage();
  data.set('edm-notifications', '{oops');
  expect(readNotifications()).toEqual([]);
  data.set('edm-notifications', '{"a":1}');
  expect(readNotifications()).toEqual([]);
  data.set('edm-notifications', JSON.stringify([n('ok'), { id: 1 }, null]));
  expect(readNotifications().map((x) => x.id)).toEqual(['ok']);
});

test('localStorage 不可用时存在内存里，本次会话内照常使用', () => {
  stubStorage(true);
  expect(readNotifications()).toEqual([]);
  pushNotifications([n('a')]);
  expect(readNotifications().map((x) => x.id)).toEqual(['a']);
  markAllRead();
  expect(readNotifications()[0]!.read).toBe(true);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`bun test tests/client/notifications-store.test.ts`
预期：FAIL，找不到模块 `src/client/notifications/store`。

- [ ] **步骤 3：实现**

创建 `src/client/notifications/store.ts`：

```ts
import { useMemo, useSyncExternalStore } from 'react';
import type { AppNotification } from './types';

const STORAGE_KEY = 'edm-notifications';
export const MAX_NOTIFICATIONS = 200;

const EMPTY: AppNotification[] = [];
const listeners = new Set<() => void>();

/** localStorage 不可用（隐私模式、被禁用、写满）时退回内存，本次会话内照常使用 */
let memory: AppNotification[] | null = null;
/** 按原始字符串缓存解析结果：useSyncExternalStore 要求没有变化时返回同一个引用 */
let cache: { raw: string | null; items: AppNotification[] } = { raw: null, items: EMPTY };

function isNotification(value: unknown): value is AppNotification {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.projectId === 'string' &&
    typeof v.projectName === 'string' &&
    typeof v.projectOrder === 'number' &&
    typeof v.at === 'number' &&
    typeof v.read === 'boolean' &&
    !!v.body &&
    typeof (v.body as { type?: unknown }).type === 'string'
  );
}

function parse(raw: string | null): AppNotification[] {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isNotification) : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function readNotifications(): AppNotification[] {
  if (memory) return memory;
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cache.raw) cache = { raw, items: parse(raw) };
  return cache.items;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function write(items: AppNotification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    memory = null;
  } catch {
    memory = items;
  }
  emit();
}

/** 入库并返回真正新增的那些（id 已存在的被忽略：另一个标签页已经写过） */
export function pushNotifications(incoming: readonly AppNotification[]): AppNotification[] {
  const current = readNotifications();
  const known = new Set(current.map((n) => n.id));
  const fresh = incoming.filter((n) => !known.has(n.id));
  if (fresh.length > 0) write([...fresh, ...current].slice(0, MAX_NOTIFICATIONS));
  return fresh;
}

export function dismissNotification(id: string): void {
  write(readNotifications().filter((n) => n.id !== id));
}

export function clearNotifications(): void {
  write([]);
}

export function markAllRead(): void {
  const current = readNotifications();
  if (current.every((n) => n.read)) return;
  write(current.map((n) => (n.read ? n : { ...n, read: true })));
}

if (typeof window !== 'undefined') {
  // 其他标签页改了通知（新增 / 清除 / 已读）时同步
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) emit();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNotifications(): { items: AppNotification[]; unread: number } {
  const items = useSyncExternalStore(subscribe, readNotifications, () => EMPTY);
  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);
  return { items, unread };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`bun test tests/client/notifications-store.test.ts`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/client/notifications/store.ts tests/client/notifications-store.test.ts
git commit -m "feat: 通知 store：localStorage 持久化、200 条上限、按 id 去重、跨标签页同步"
```

---

### 任务 8：抽出 `ui/Drawer`，`NoteDrawer` 改用它

**文件：**
- 创建：`src/client/ui/Drawer.tsx`
- 修改：`src/client/components/NoteDrawer.tsx`（删除 `useDialogFocus` / `useEscapeClose` / `FOCUSABLE` / `useFocusTrap` 四段，以及 `NoteDrawer` 的返回 JSX）
- 测试：`tests/client/note-drawer.test.tsx`（不改，作为回归）

- [ ] **步骤 1：先跑一遍现有测试作为基线**

运行：`bun test tests/client/note-drawer.test.tsx`
预期：PASS。

- [ ] **步骤 2：创建 `src/client/ui/Drawer.tsx`**

```tsx
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { cn } from './tw';

export type DrawerProps = {
  /** 读屏用的对话框名称 */
  label: string;
  /** 指向标题元素的 id；有标题时读屏优先读它 */
  labelledBy?: string;
  /** 宽度、底色等，追加到侧边面板上 */
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

/** 打开时聚焦面板内带 data-autofocus 的元素，卸载时把焦点还给打开前的元素 */
function useDialogFocus(container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const prev = document.activeElement;
    container.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => (prev as HTMLElement | null)?.focus?.();
  }, [container]);
}

/**
 * Esc 关闭抽屉。命令面板已用 Esc 关了自己（defaultPrevented）、正在输入法组合、
 * 或头上还压着一个打开的模态框（添加 / 重命名 / 确认对话框）时，都不关抽屉：一次 Esc 只关最上面那一层。
 */
function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      if (document.querySelector('dialog[open]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** aria-modal 的抽屉要把 Tab 困在里面：到末尾回到开头，到开头 Shift+Tab 回到末尾，焦点不会漏到被遮住的页面上 */
function useFocusTrap() {
  const ref = useRef<HTMLElement>(null);
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return { ref, onKeyDown };
}

/** 右侧抽屉外壳：遮罩（点击关闭）+ 模态侧边面板（焦点陷阱、Esc 关闭、焦点归还） */
export function Drawer({ label, labelledBy, className, onClose, children }: DrawerProps) {
  const trap = useFocusTrap();
  useDialogFocus(trap.ref);
  useEscapeClose(onClose);
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-50 animate-fade-in bg-(--backdrop) backdrop-blur-[2px]" onClick={onClose} />
      <aside
        ref={trap.ref}
        onKeyDown={trap.onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        className={cn('fixed inset-y-0 right-0 z-[51] flex animate-slide-in-right flex-col bg-surface shadow-pop ring-1 ring-line-strong', className)}
      >
        {children}
      </aside>
    </>
  );
}
```

- [ ] **步骤 3：改 `NoteDrawer.tsx`**

1. 删除 `useDialogFocus`、`useEscapeClose`、`FOCUSABLE`、`useFocusTrap` 四段（约第 248–295 行，从 `/** 对话框焦点管理…` 到 `useFocusTrap` 的结束花括号）。
2. 在 import 段加 `import { Drawer } from '../ui/Drawer';`。
3. `NoteDrawer` 函数体里删除这三行：

```tsx
  const closeRef = useDialogFocus();
  const trap = useFocusTrap();
  useEscapeClose(onClose);
```

4. 把 `return (` 到函数结尾的 JSX 外层替换。原来是

```tsx
    <>
      <div aria-hidden="true" className="fixed inset-0 z-50 animate-fade-in bg-(--backdrop) backdrop-blur-[2px]" onClick={onClose} />
      <aside
        ref={trap.ref}
        onKeyDown={trap.onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="笔记详情"
        aria-labelledby="note-drawer-title"
        className="fixed inset-y-0 right-0 z-[51] flex w-[min(100vw,52rem)] animate-slide-in-right flex-col bg-surface shadow-pop ring-1 ring-line-strong"
      >
        …header 与正文不变…
      </aside>
    </>
```

改为

```tsx
    <Drawer label="笔记详情" labelledBy="note-drawer-title" className="w-[min(100vw,52rem)]" onClose={onClose}>
      …header 与正文不变…
    </Drawer>
```

5. 关闭按钮把 `ref={closeRef}` 换成 `data-autofocus`：

```tsx
          <Button data-autofocus variant="ghost" size="icon" className="-mr-2 ml-auto" title="退出 (Esc)" aria-label="关闭" onClick={onClose}>
```

6. 清理不再使用的 import：如果 `KeyboardEvent as ReactKeyboardEvent`、`useRef`、`useEffect` 在文件里已没有其他用处就删掉（`useNoteSnapshot` 仍用 `useEffect` / `useState`，`lockedId` 仍用 `useRef`，以实际为准）。

- [ ] **步骤 4：运行回归测试与类型检查**

运行：`bun test tests/client/note-drawer.test.tsx` 和 `bun run typecheck`
预期：PASS（断言里的 `role="dialog"`、`aria-modal="true"`、`aria-labelledby="note-drawer-title"`、`title="退出 (Esc)"` 都还在），类型检查无输出。

- [ ] **步骤 5：Commit**

```bash
git add src/client/ui/Drawer.tsx src/client/components/NoteDrawer.tsx
git commit -m "refactor: 抽出 ui/Drawer（遮罩、焦点陷阱、Esc 关闭），NoteDrawer 改用它"
```

---

### 任务 9：`NotificationCard` 与 `NotificationBell`

**文件：**
- 修改：`src/client/styles/index.css`（`@theme` 里的动画定义）
- 创建：`src/client/components/NotificationCard.tsx`
- 创建：`src/client/components/NotificationBell.tsx`
- 测试：`tests/client/notification-card.test.tsx`

- [ ] **步骤 1：写失败的测试**

创建 `tests/client/notification-card.test.tsx`：

```tsx
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NoteChange } from '../../src/shared/types';
import { NotificationBell, unreadBadge } from '../../src/client/components/NotificationBell';
import { NotificationCard } from '../../src/client/components/NotificationCard';
import type { AppNotification } from '../../src/client/notifications/types';

const noop = () => {};
const change = (kind: 'added' | 'modified' | 'removed', title: string): NoteChange => ({
  kind,
  id: `implemented/a/${title}.md`,
  title,
  lifecycle: 'implemented',
});
const moved: NoteChange = { kind: 'moved', id: 'implemented/a/m.md', fromId: 'proposed/a/m.md', title: 'M', from: 'proposed', to: 'implemented' };

function notification(body: AppNotification['body'], over: Partial<AppNotification> = {}): AppNotification {
  return { id: 'n1', projectId: 'P', projectName: '工程决策中心', projectOrder: 1, at: Date.now(), read: false, body, ...over };
}

const render = (n: AppNotification, variant: 'toast' | 'drawer') =>
  renderToStaticMarkup(
    <NotificationCard notification={n} variant={variant} onOpenProject={noop} onOpenNote={noop} onDismiss={noop} />,
  );

const buttons = (html: string) => html.match(/<button/g)?.length ?? 0;

test('已删除的笔记划线显示、不渲染成按钮；其余行可点', () => {
  const html = render(notification({ type: 'changes', changes: [change('added', 'A'), change('removed', 'B')] }), 'drawer');
  expect(html).toContain('line-through');
  expect(html).toContain('>B<');
  // 项目名 + 清除 + 「A」这一行
  expect(buttons(html)).toBe(3);
});

test('迁移行的标签写成「待评审 → 已落地」', () => {
  expect(render(notification({ type: 'changes', changes: [moved] }), 'drawer')).toContain('待评审 → 已落地');
});

test('toast：超过 3 处时只列前 3 处并汇总剩余，带倒计时条', () => {
  const changes = [moved, change('added', 'A'), change('added', 'C'), change('modified', 'Y'), change('removed', 'Z')];
  const html = render(notification({ type: 'changes', changes }), 'toast');
  expect(html).toContain('另有 1 处修改、1 处删除');
  expect(html).not.toContain('>Y<');
  expect(html).toContain('animate-toast-timer');
  expect(html).toContain('aria-label="收起"');
  expect(html).toContain('5 处变更 · 刚刚');
});

test('drawer：超过 3 处时有「展开全部」，未读带「新」，清除按钮', () => {
  const changes = [moved, change('added', 'A'), change('added', 'C'), change('modified', 'Y')];
  const html = render(notification({ type: 'changes', changes }), 'drawer');
  expect(html).toContain('展开全部 4 处');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('>新<');
  expect(html).toContain('aria-label="清除通知"');
  expect(render(notification({ type: 'changes', changes }, { read: true }), 'drawer')).not.toContain('>新<');
});

test('异常与已恢复', () => {
  expect(render(notification({ type: 'error', reason: '路径失效：ENOENT' }), 'drawer')).toContain('路径失效：ENOENT');
  const recovered = render(notification({ type: 'recovered' }), 'drawer');
  expect(recovered).toContain('已恢复');
  expect(recovered).toContain('实时监听已恢复');
});

test('卡片带项目色变量与可访问名称', () => {
  const html = render(notification({ type: 'changes', changes: [change('added', 'A')] }), 'drawer');
  expect(html).toContain('--project:#1D4ED8'); // projectColor(1)
  expect(html).toContain('aria-label="工程决策中心：新增 1：A"');
});

test('未读角标：0 不显示，超过 99 显示 99+', () => {
  expect(unreadBadge(0)).toBeNull();
  expect(unreadBadge(7)).toBe('7');
  expect(unreadBadge(100)).toBe('99+');
  expect(renderToStaticMarkup(<NotificationBell unread={0} open={false} onClick={noop} />)).toContain('aria-label="通知"');
  const html = renderToStaticMarkup(<NotificationBell unread={120} open onClick={noop} />);
  expect(html).toContain('aria-label="通知，120 条未读"');
  expect(html).toContain('>99+<');
  expect(html).toContain('aria-expanded="true"');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`bun test tests/client/notification-card.test.tsx`
预期：FAIL，找不到模块 `NotificationBell` / `NotificationCard`。

- [ ] **步骤 3：加倒计时动画**

在 `src/client/styles/index.css` 的 `@theme` 块里，`--animate-ping-slow: …;` 之后加一行：

```css
  /* 通知卡片倒计时条；时长必须与 NotificationStack 的 TOAST_MS 一致 */
  --animate-toast-timer: toast-timer 6s linear both;
```

在同一块里 `@keyframes shimmer { … }` 之后加：

```css
  @keyframes toast-timer {
    to {
      transform: scaleX(0);
    }
  }
```

- [ ] **步骤 4：实现 `NotificationBell`**

创建 `src/client/components/NotificationBell.tsx`：

```tsx
import { Bell } from 'lucide-react';
import { Button } from '../ui/Button';

/** 角标文字：没有未读返回 null，超过 99 显示 99+ */
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

export type NotificationBellProps = {
  unread: number;
  /** 通知抽屉是否打开 */
  open: boolean;
  onClick: () => void;
};

export function NotificationBell({ unread, open, onClick }: NotificationBellProps) {
  const badge = unreadBadge(unread);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      title="通知"
      aria-label={badge ? `通知，${unread} 条未读` : '通知'}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
    >
      <Bell aria-hidden="true" />
      {badge && (
        <span
          aria-hidden="true"
          className="tabular absolute top-1 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] leading-none font-bold text-white ring-2 ring-surface"
        >
          {badge}
        </span>
      )}
    </Button>
  );
}
```

- [ ] **步骤 5：实现 `NotificationCard`**

创建 `src/client/components/NotificationCard.tsx`：

```tsx
import { ChevronDown, X } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import type { NoteChange } from '../../shared/types';
import { clockTime } from '../format';
import { projectColor } from '../labels';
import { CHANGE_TONES, changeLabel, notificationText, remainderText } from '../notifications/derive';
import type { AppNotification } from '../notifications/types';
import { Badge } from '../ui/Badge';
import { cn } from '../ui/tw';

/** 卡片默认列出的变更行数 */
export const PREVIEW_ROWS = 3;

export type NotificationCardProps = {
  notification: AppNotification;
  /** toast：右上角弹出（倒计时、只列前几处）；drawer：抽屉里（可展开全部、显示未读与时刻） */
  variant: 'toast' | 'drawer';
  onOpenProject: (notification: AppNotification) => void;
  onOpenNote: (notification: AppNotification, noteId: string) => void;
  /** toast 里是「收起」，drawer 里是「清除」 */
  onDismiss: (id: string) => void;
  /** 仅 toast：倒计时是否暂停（鼠标停留 / 焦点在卡片内） */
  paused?: boolean;
  /** 仅 drawer：计算「今天 14:32 / 10月11日 14:32」用的当前时间 */
  now?: number;
};

function ChangeRow({ change, onOpen }: { change: NoteChange; onOpen: () => void }) {
  const label = <Badge tone={CHANGE_TONES[change.kind]}>{changeLabel(change)}</Badge>;
  if (change.kind === 'removed') {
    return (
      <div className="flex items-center gap-2 px-1.5 py-1">
        {label}
        <span className="truncate text-fg-subtle line-through">{change.title}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2"
    >
      {label}
      <span className="truncate text-fg">{change.title}</span>
    </button>
  );
}

function StatusRow({ tone, label, text }: { tone: 'amber' | 'emerald'; label: string; text: string }) {
  return (
    <div className="flex items-start gap-2 px-1.5 py-1">
      <Badge tone={tone} className="mt-px">
        {label}
      </Badge>
      <span className="min-w-0 leading-relaxed break-words text-fg-muted">{text}</span>
    </div>
  );
}

function headerMeta(n: AppNotification, variant: NotificationCardProps['variant'], now: number): string {
  const count = n.body.type === 'changes' ? n.body.changes.length : 0;
  if (variant === 'toast') return count > 0 ? `${count} 处变更 · 刚刚` : '刚刚';
  const time = clockTime(n.at, now);
  return count > 0 ? `${count} 处 · ${time}` : time;
}

/** 通知卡片：左侧项目色条 + 淡项目色页眉（项目色走 CSS 变量，属于设计规范允许的动态值） */
export function NotificationCard({ notification: n, variant, onOpenProject, onOpenNote, onDismiss, paused = false, now = Date.now() }: NotificationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const changes = n.body.type === 'changes' ? n.body.changes : [];
  const visible = variant === 'drawer' && expanded ? changes : changes.slice(0, PREVIEW_ROWS);
  const remainder = variant === 'toast' ? remainderText(changes, PREVIEW_ROWS) : null;
  const canExpand = variant === 'drawer' && changes.length > PREVIEW_ROWS;

  return (
    <article
      aria-label={`${n.projectName}：${notificationText(n)}`}
      style={{ '--project': projectColor(n.projectOrder) } as CSSProperties}
      className={cn('relative overflow-hidden rounded-xl bg-surface text-[13px] ring-1 ring-line', variant === 'toast' ? 'shadow-pop' : 'shadow-card')}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-(--project)" />
      <header className="flex items-center gap-2 border-b border-line bg-[color-mix(in_srgb,var(--project)_7%,var(--surface))] py-1.5 pr-1.5 pl-4">
        <button
          type="button"
          onClick={() => onOpenProject(n)}
          className="min-w-0 truncate font-semibold text-fg underline-offset-2 hover:underline"
        >
          {n.projectName}
        </button>
        {variant === 'drawer' && !n.read && <Badge tone="blue">新</Badge>}
        <span className="tabular ml-auto shrink-0 font-mono text-2xs text-fg-subtle">{headerMeta(n, variant, now)}</span>
        <button
          type="button"
          aria-label={variant === 'toast' ? '收起' : '清除通知'}
          title={variant === 'toast' ? '收起' : '清除'}
          onClick={() => onDismiss(n.id)}
          className="grid size-6 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </header>

      <div className="py-1.5 pr-2 pl-3">
        {n.body.type === 'error' && <StatusRow tone="amber" label="异常" text={n.body.reason} />}
        {n.body.type === 'recovered' && <StatusRow tone="emerald" label="已恢复" text="实时监听已恢复" />}
        {visible.map((c) => (
          <ChangeRow key={`${c.kind}:${c.id}`} change={c} onOpen={() => onOpenNote(n, c.id)} />
        ))}
        {remainder && <p className="px-1.5 pt-0.5 pb-1 text-xs text-fg-subtle">{remainder}</p>}
        {canExpand && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-accent-text transition-colors hover:bg-accent-soft"
          >
            {expanded ? '收起' : `展开全部 ${changes.length} 处`}
            <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
        )}
      </div>

      {variant === 'toast' && (
        <span
          aria-hidden="true"
          className={cn('absolute inset-x-0 bottom-0 h-0.5 origin-left animate-toast-timer bg-(--project)/60', paused && '[animation-play-state:paused]')}
        />
      )}
    </article>
  );
}
```

- [ ] **步骤 6：运行测试验证通过**

运行：`bun test tests/client/notification-card.test.tsx`
预期：PASS。如果「项目色变量」断言因 React 输出的 style 格式不同而失败（例如 `--project:#1D4ED8` 前后带空格），打印 `html` 看实际格式，按实际格式调整断言字符串。

- [ ] **步骤 7：类型检查**

运行：`bun run typecheck`
预期：无输出。

- [ ] **步骤 8：Commit**

```bash
git add src/client/styles/index.css src/client/components/NotificationCard.tsx src/client/components/NotificationBell.tsx tests/client/notification-card.test.tsx
git commit -m "feat: 通知卡片（项目色条 + 淡色页眉，toast / 抽屉两种变体）与铃铛角标"
```

---

### 任务 10：系统通知、弹出栈与通知抽屉

**文件：**
- 创建：`src/client/notifications/desktop.ts`
- 创建：`src/client/components/NotificationStack.tsx`
- 创建：`src/client/components/NotificationDrawer.tsx`
- 测试：在 `tests/client/notification-card.test.tsx` 末尾追加抽屉渲染用例

- [ ] **步骤 1：写失败的测试**

在 `tests/client/notification-card.test.tsx` 顶部 import 加：

```tsx
import { NotificationDrawer } from '../../src/client/components/NotificationDrawer';
```

文件末尾追加：

```tsx
test('通知抽屉：模态对话框、标题、条数；为空时禁用全部清除并显示空态', () => {
  const props = { onClose: noop, onClearAll: noop, onDismiss: noop, onOpenProject: noop, onOpenNote: noop };
  const empty = renderToStaticMarkup(<NotificationDrawer items={[]} {...props} />);
  expect(empty).toContain('role="dialog"');
  expect(empty).toContain('aria-labelledby="notification-drawer-title"');
  expect(empty).toContain('暂无通知');
  expect(empty).toMatch(/<button[^>]*disabled[^>]*>全部清除/);

  const items = [notification({ type: 'recovered' }, { id: 'a' }), notification({ type: 'recovered' }, { id: 'b', at: 0 })];
  const html = renderToStaticMarkup(<NotificationDrawer items={items} {...props} />);
  expect(html).toContain('2 条');
  expect(html).toContain('今天');
  expect(html).toContain('更早');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`bun test tests/client/notification-card.test.tsx`
预期：FAIL，找不到模块 `NotificationDrawer`。

- [ ] **步骤 3：实现 `desktop.ts`**

创建 `src/client/notifications/desktop.ts`：

```ts
import { notificationText } from './derive';
import type { AppNotification } from './types';

export type DesktopPermission = NotificationPermission | 'unsupported';

export function desktopPermission(): DesktopPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** 必须在用户点击里调用（浏览器要求）；返回最终的权限状态 */
export async function requestDesktopPermission(): Promise<DesktopPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

/**
 * 发系统通知。同一项目用同一个 tag，新的替换旧的，不会在系统通知中心里堆积。
 * 点击时把窗口拉到前台，再交给 onClick 跳转。
 */
export function showDesktopNotification(n: AppNotification, onClick: () => void): void {
  if (desktopPermission() !== 'granted') return;
  try {
    const notification = new Notification(n.projectName, { body: notificationText(n), tag: `edm:${n.projectId}` });
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  } catch {
    // 个别环境（如安卓 Chrome）不允许直接构造 Notification，只能走 Service Worker；这里不支持，静默跳过
  }
}
```

- [ ] **步骤 4：实现 `NotificationStack`**

创建 `src/client/components/NotificationStack.tsx`：

```tsx
import { useEffect, useRef, useState, type FocusEvent } from 'react';
import type { AppNotification } from '../notifications/types';
import { NotificationCard } from './NotificationCard';

export const MAX_VISIBLE_TOASTS = 3;
/** 每张卡片停留时长；与 styles/index.css 里 --animate-toast-timer 的 6s 一致 */
export const TOAST_MS = 6000;

export type NotificationStackProps = {
  /** 弹出队列（含排队中的），只显示前 MAX_VISIBLE_TOASTS 张 */
  items: readonly AppNotification[];
  onDismiss: (id: string) => void;
  onOpenProject: (notification: AppNotification) => void;
  onOpenNote: (notification: AppNotification, noteId: string) => void;
};

type TimedToastProps = Omit<NotificationStackProps, 'items'> & { notification: AppNotification };

/** 一张带倒计时的卡片：鼠标停留或焦点在卡片内时暂停，离开后按剩余时间继续 */
function TimedToast({ notification, onDismiss, onOpenProject, onOpenNote }: TimedToastProps) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(TOAST_MS);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(notification.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [paused, notification.id, onDismiss]);

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
  };

  return (
    <div
      className="pointer-events-auto animate-slide-in-right"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={onBlur}
    >
      <NotificationCard
        notification={notification}
        variant="toast"
        paused={paused}
        onDismiss={onDismiss}
        onOpenProject={onOpenProject}
        onOpenNote={onOpenNote}
      />
    </div>
  );
}

/**
 * 右上角弹出栈（顶栏下方）。外层的 aria-live 区域始终存在，新增的卡片才会被读屏播报。
 * 与右下角的 Toaster（操作回执）分开：这里只放外部变更。
 */
export function NotificationStack({ items, ...handlers }: NotificationStackProps) {
  return (
    <div
      role="region"
      aria-label="变更通知"
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed top-16 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2"
    >
      {items.slice(0, MAX_VISIBLE_TOASTS).map((n) => (
        <TimedToast key={n.id} notification={n} {...handlers} />
      ))}
    </div>
  );
}
```

- [ ] **步骤 5：实现 `NotificationDrawer`**

创建 `src/client/components/NotificationDrawer.tsx`：

```tsx
import { BellOff, BellRing, X } from 'lucide-react';
import { useState } from 'react';
import { desktopPermission, requestDesktopPermission, type DesktopPermission } from '../notifications/desktop';
import { groupByDay } from '../notifications/derive';
import type { AppNotification } from '../notifications/types';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { EmptyState } from '../ui/State';
import { NotificationCard } from './NotificationCard';

export type NotificationDrawerProps = {
  items: readonly AppNotification[];
  onClose: () => void;
  onClearAll: () => void;
  onDismiss: (id: string) => void;
  onOpenProject: (notification: AppNotification) => void;
  onOpenNote: (notification: AppNotification, noteId: string) => void;
};

const PERMISSION_TEXT: Record<Exclude<DesktopPermission, 'unsupported'>, string> = {
  default: '页面在后台时用系统通知提醒',
  granted: '系统通知已开启',
  denied: '系统通知被浏览器拦截，可在地址栏左侧的站点设置中允许',
};

function DesktopPermissionBar() {
  const [permission, setPermission] = useState<DesktopPermission>(desktopPermission);
  if (permission === 'unsupported') return null;
  return (
    <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-xs text-fg-muted shadow-card ring-1 ring-line">
      <BellRing aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
      <span className="flex-1 leading-relaxed">{PERMISSION_TEXT[permission]}</span>
      {permission === 'default' && (
        <Button variant="primary" size="sm" onClick={() => void requestDesktopPermission().then(setPermission)}>
          开启
        </Button>
      )}
    </div>
  );
}

export function NotificationDrawer({ items, onClose, onClearAll, onDismiss, onOpenProject, onOpenNote }: NotificationDrawerProps) {
  const now = Date.now();
  return (
    <Drawer label="通知" labelledBy="notification-drawer-title" className="w-[min(100vw,26rem)] bg-(--bg)" onClose={onClose}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
        <h2 id="notification-drawer-title" className="font-display text-[15px] font-bold text-fg">
          通知
        </h2>
        <span className="tabular font-mono text-2xs text-fg-subtle">{items.length} 条</span>
        <Button variant="ghost" size="sm" className="ml-auto" disabled={items.length === 0} onClick={onClearAll}>
          全部清除
        </Button>
        <Button data-autofocus variant="ghost" size="icon" className="-mr-2" title="关闭 (Esc)" aria-label="关闭" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </header>
      <DesktopPermissionBar />
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
        {items.length === 0 ? (
          <EmptyState compact icon={BellOff} title="暂无通知">
            项目里的笔记有新增、修改、迁移或删除时，会在这里列出。
          </EmptyState>
        ) : (
          groupByDay(items, now).map(([label, list]) => (
            <section key={label} aria-label={label}>
              <h3 className="px-1 pt-4 pb-2 text-2xs font-bold tracking-wide text-fg-subtle">{label}</h3>
              <div className="flex flex-col gap-2">
                {list.map((n) => (
                  <NotificationCard
                    key={n.id}
                    notification={n}
                    variant="drawer"
                    now={now}
                    onDismiss={onDismiss}
                    onOpenProject={onOpenProject}
                    onOpenNote={onOpenNote}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </Drawer>
  );
}
```

- [ ] **步骤 6：运行测试验证通过**

运行：`bun test tests/client/notification-card.test.tsx` 和 `bun run typecheck`
预期：PASS，类型检查无输出。

- [ ] **步骤 7：Commit**

```bash
git add src/client/notifications/desktop.ts src/client/components/NotificationStack.tsx src/client/components/NotificationDrawer.tsx tests/client/notification-card.test.tsx
git commit -m "feat: 右上角通知弹出栈、通知抽屉与系统通知"
```

---

### 任务 11：全屏、通知中心与接线

**文件：**
- 创建：`src/client/state/useFullscreen.ts`
- 创建：`src/client/notifications/useNotificationCenter.ts`
- 修改：`src/client/state/useHub.ts`
- 修改：`src/client/components/TopBar.tsx`
- 修改：`src/client/App.tsx`

这些都依赖浏览器 API 和 React 运行时，按仓库现状不做单测，由任务 12 的手动验证覆盖。每一步之后都跑 `bun run typecheck`。

- [ ] **步骤 1：`useFullscreen`**

创建 `src/client/state/useFullscreen.ts`：

```ts
import { useCallback, useSyncExternalStore } from 'react';
import { useDialogs } from '../ui/dialogs';

export type FullscreenControl = { supported: boolean; active: boolean; toggle: () => void };

function subscribe(listener: () => void): () => void {
  document.addEventListener('fullscreenchange', listener);
  return () => document.removeEventListener('fullscreenchange', listener);
}

const isActive = () => document.fullscreenElement !== null;

/**
 * 浏览器全屏（Fullscreen API，作用于整页）。按 F11 进入的是浏览器自己的全屏，网页检测不到，
 * 这时 active 仍为 false，属已知限制。
 */
export function useFullscreen(): FullscreenControl {
  const { toast } = useDialogs();
  const active = useSyncExternalStore(subscribe, isActive, () => false);
  const supported = typeof document !== 'undefined' && document.fullscreenEnabled === true;
  const toggle = useCallback(() => {
    const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    action.catch((err: unknown) => toast({ kind: 'error', message: `无法切换全屏：${err instanceof Error ? err.message : String(err)}` }));
  }, [toast]);
  return { supported, active, toggle };
}
```

- [ ] **步骤 2：`useNotificationCenter`**

创建 `src/client/notifications/useNotificationCenter.ts`：

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { showDesktopNotification } from './desktop';
import { markAllRead, pushNotifications } from './store';
import type { AppNotification } from './types';

export type OpenNotification = (notification: AppNotification, noteId: string | null) => void;

export type NotificationCenter = {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** 弹出队列（含排队中的），NotificationStack 只显示前几张 */
  toasts: readonly AppNotification[];
  dismissToast: (id: string) => void;
  /** 交给 useHub：入库，再按页面状态决定弹卡片、发系统通知还是只累加角标 */
  receive: (items: readonly AppNotification[]) => void;
  /** 点击卡片或系统通知：关闭抽屉、收起该卡片，再交给 onOpen 跳转 */
  activate: OpenNotification;
};

/** 排队中的卡片上限：页面开着但人不在时，回来不至于被几十张卡片轮番轰炸 */
const MAX_QUEUED_TOASTS = 10;

export function useNotificationCenter(onOpen: OpenNotification): NotificationCenter {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<readonly AppNotification[]>([]);
  const drawerOpenRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });

  const closeDrawer = useCallback(() => {
    drawerOpenRef.current = false;
    setDrawerOpen(false);
  }, []);

  const openDrawer = useCallback(() => {
    drawerOpenRef.current = true;
    setDrawerOpen(true);
    setToasts([]);
    markAllRead();
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const activate = useCallback<OpenNotification>(
    (n, noteId) => {
      closeDrawer();
      dismissToast(n.id);
      onOpenRef.current(n, noteId);
    },
    [closeDrawer, dismissToast],
  );

  const receive = useCallback(
    (items: readonly AppNotification[]) => {
      const fresh = pushNotifications(items);
      if (fresh.length === 0) return; // 另一个标签页已处理过
      if (drawerOpenRef.current) return markAllRead(); // 抽屉开着，新通知直接出现在列表里
      if (document.visibilityState === 'hidden') {
        for (const n of fresh) showDesktopNotification(n, () => activate(n, null));
        return;
      }
      setToasts((list) => [...list, ...fresh].slice(-MAX_QUEUED_TOASTS));
    },
    [activate],
  );

  return { drawerOpen, openDrawer, closeDrawer, toasts, dismissToast, receive, activate };
}
```

- [ ] **步骤 3：改 `useHub`**

在 `src/client/state/useHub.ts` 中：

1. import 段改为：

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConfigChangedEvent, ProjectErrorEvent, ProjectMeta, ProjectUpdatedEvent } from '../../shared/types';
import { api } from '../api';
import { toNotifications, type HubNotifyEvent } from '../notifications/derive';
import type { AppNotification } from '../notifications/types';
```

2. 函数签名与开头改为：

```ts
export function useHub(onNotify?: (items: readonly AppNotification[]) => void): HubState & { refreshConfig: () => Promise<void> } {
  const [state, setState] = useState<HubState>(INITIAL);
  /** 事件到达时用来取「变化前」的项目元数据；事件回调里同步更新，连续两条事件也不会拿到旧值 */
  const projectsRef = useRef<ProjectMeta[]>([]);
  const lastErrorsRef = useRef<ReadonlyMap<string, string>>(new Map());
  const onNotifyRef = useRef(onNotify);
  useEffect(() => {
    onNotifyRef.current = onNotify;
  });
  useEffect(() => {
    projectsRef.current = state.projects;
  }, [state.projects]);

  const notify = useCallback((event: HubNotifyEvent) => {
    const prev = projectsRef.current.find((p) => p.id === event.data.id);
    const result = toNotifications(event, prev, lastErrorsRef.current);
    lastErrorsRef.current = result.lastErrors;
    if (result.notifications.length > 0) onNotifyRef.current?.(result.notifications);
  }, []);
```

（`refreshConfig` 保持不变，放在 `notify` 之后。）

3. 函数注释里补一行：`- project-updated / project-error 经 toNotifications 转成通知交给 onNotify（隐藏项目、首次扫描不产生通知）。`

4. `project-updated` 监听器改为：

```ts
      es.addEventListener('project-updated', (event) => {
        const data = parse<ProjectUpdatedEvent>(event);
        if (!data) return void refreshConfig();
        notify({ name: 'project-updated', data });
        projectsRef.current = upsert(projectsRef.current, data.project);
        setState((s) => ({
          ...s,
          projects: upsert(s.projects, data.project),
          versions: { ...s.versions, [data.id]: (s.versions[data.id] ?? 0) + 1 },
        }));
      });
```

5. `project-error` 监听器改为：

```ts
      es.addEventListener('project-error', (event) => {
        const data = parse<ProjectErrorEvent>(event);
        if (data) notify({ name: 'project-error', data });
        void refreshConfig();
      });
```

6. effect 依赖数组 `[refreshConfig]` 改为 `[refreshConfig, notify]`。

- [ ] **步骤 4：改 `TopBar.tsx`**

1. import 段改为：

```tsx
import { Maximize, Menu, Minimize, RefreshCw, Search } from 'lucide-react';
import type { ProjectMeta } from '../../shared/types';
import { THEME_ICONS, VIEW_ICONS } from '../icons';
import { THEME_LABELS } from '../labels';
import { VIEW_LABELS, VIEWS, type ViewId } from '../router';
import type { FullscreenControl } from '../state/useFullscreen';
import type { SyncStatus } from '../state/useHub';
import { THEME_PREFERENCES, type ThemePreference } from '../theme';
import { Button } from '../ui/Button';
import { Kbd, MOD_KEY_LABEL } from '../ui/Kbd';
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl';
import { cn } from '../ui/tw';
import { NotificationBell } from './NotificationBell';
```

2. `TopBarProps` 增加三项：

```tsx
  fullscreen: FullscreenControl;
  /** 未读通知数，用于铃铛角标 */
  unread: number;
  notificationsOpen: boolean;
  onOpenNotifications: () => void;
```

3. `TopBar` 解构改为：

```tsx
  const { project, view, theme, railOpen, fullscreen, unread, notificationsOpen, onViewChange, onOpenPalette, onToggleRail, onThemeChange, onOpenNotifications } =
    props;
```

4. 在主题 `SegmentedControl` 与 `<SyncBeacon …/>` 之间插入：

```tsx
      {fullscreen.supported && (
        <Button
          variant="ghost"
          size="icon"
          className="max-sm:hidden"
          title={fullscreen.active ? '退出全屏' : '全屏'}
          aria-label="全屏"
          aria-pressed={fullscreen.active}
          onClick={fullscreen.toggle}
        >
          {fullscreen.active ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        </Button>
      )}

      <NotificationBell unread={unread} open={notificationsOpen} onClick={onOpenNotifications} />
```

- [ ] **步骤 5：改 `App.tsx`**

1. lucide import 加上 `Maximize, Minimize`：`import { Folder, FolderPlus, Maximize, Minimize, RefreshCw, ServerOff, WifiOff } from 'lucide-react';`
2. 新增 import：

```tsx
import { NotificationDrawer } from './components/NotificationDrawer';
import { NotificationStack } from './components/NotificationStack';
import { clearNotifications, dismissNotification, useNotifications } from './notifications/store';
import type { AppNotification } from './notifications/types';
import { useNotificationCenter } from './notifications/useNotificationCenter';
import { useFullscreen } from './state/useFullscreen';
import { DialogProvider, useDialogs } from './ui/dialogs';
```

（原来的 `import { DialogProvider } from './ui/dialogs';` 删掉，由上面这行替代。）

3. `Shell` 开头把 `const hub = useHub();` 替换为：

```tsx
  const { toast } = useDialogs();
  // openNotification 在下方声明（函数提升），用到的 hub / route 在调用时都已就绪
  const center = useNotificationCenter((n, noteId) => openNotification(n, noteId));
  const hub = useHub(center.receive);
  const { items: notifications, unread } = useNotifications();
  const fullscreen = useFullscreen();
```

4. 在 `selectProject` 定义之后加：

```tsx
  /** 点通知：项目已被移除时提示；否则切到该项目（保持当前视图），带笔记 id 时直接打开 */
  function openNotification(n: AppNotification, noteId: string | null) {
    if (!hub.projects.some((p) => p.id === n.projectId)) {
      toast({ kind: 'info', message: `项目「${n.projectName}」已移除` });
      return;
    }
    setQuery('');
    navigate({ projectId: n.projectId, view: route?.view ?? 'baseline', note: noteId });
  }
```

5. `commands` 里，在主题那组 `...THEME_PREFERENCES.map(...)` 之后追加：

```tsx
      ...(fullscreen.supported
        ? [
            {
              id: 'fullscreen',
              group: '外观',
              label: fullscreen.active ? '退出全屏' : '进入全屏',
              icon: fullscreen.active ? Minimize : Maximize,
              keywords: 'fullscreen 全屏',
              run: fullscreen.toggle,
            },
          ]
        : []),
```

依赖数组加上 `fullscreen`。

6. `<TopBar …>` 加四个 props：

```tsx
        fullscreen={fullscreen}
        unread={unread}
        notificationsOpen={center.drawerOpen}
        onOpenNotifications={center.openDrawer}
```

7. 在 `<CommandPalette …/>` 之前插入：

```tsx
      <NotificationStack
        items={center.toasts}
        onDismiss={center.dismissToast}
        onOpenProject={(n) => center.activate(n, null)}
        onOpenNote={center.activate}
      />
      {center.drawerOpen && (
        <NotificationDrawer
          items={notifications}
          onClose={center.closeDrawer}
          onClearAll={clearNotifications}
          onDismiss={dismissNotification}
          onOpenProject={(n) => center.activate(n, null)}
          onOpenNote={center.activate}
        />
      )}
```

- [ ] **步骤 6：类型检查与全量测试**

运行：`bun run typecheck` 和 `bun test`
预期：类型检查无输出；测试全部 PASS。

- [ ] **步骤 7：Commit**

```bash
git add src/client/state/useFullscreen.ts src/client/notifications/useNotificationCenter.ts src/client/state/useHub.ts src/client/components/TopBar.tsx src/client/App.tsx
git commit -m "feat: 接入变更通知（弹出卡片 / 系统通知 / 铃铛抽屉）与全屏按钮"
```

---

### 任务 12：文档与手动验证

**文件：**
- 修改：`docs/superpowers/specs/2026-10-12-modern-ui-design-system.md`（第 3 节通用组件表）
- 修改：`README.md`（「降级行为」表之前加一节）

- [ ] **步骤 1：更新设计系统文档**

在 `2026-10-12-modern-ui-design-system.md` 第 3 节的表格里，`Modal、useDialogs()` 那一行之后加两行：

```markdown
| `SegmentedControl`（`mode`: nav / radio；`iconOnly`） | 滑动底板分段控件：视图切换（nav）、主题切换（radio，方向键可移动） |
| `Drawer`（`label` `labelledBy` `className`） | 右侧模态抽屉外壳：遮罩、焦点陷阱、Esc 关闭、焦点归还；内部带 `data-autofocus` 的元素打开时获得焦点 |
```

- [ ] **步骤 2：更新 README**

在 `README.md` 的「## 降级行为」之前插入：

```markdown
## 变更通知

监听中的项目有笔记新增、修改、状态迁移（换了生命周期目录）、删除，或项目出现异常 / 恢复时：

- 页面在前台：右上角弹出卡片，6 秒后收起（鼠标停留时暂停）
- 页面在后台：发系统通知（需在通知抽屉里点「开启」授权一次）
- 全部收进顶栏铃铛打开的通知抽屉：可单条清除或全部清除，点项目名切到该项目，点某一行直接打开那篇笔记

通知保存在浏览器本地（最多 200 条），页面关闭期间发生的变更不会补发。隐藏的项目不发通知。
```

- [ ] **步骤 3：Commit 文档**

```bash
git add docs/superpowers/specs/2026-10-12-modern-ui-design-system.md README.md
git commit -m "docs: 变更通知说明；设计系统补 SegmentedControl 与 Drawer"
```

- [ ] **步骤 4：最终自动化验证**

运行：`bun test` 和 `bun run typecheck`
预期：全部 PASS，类型检查无输出。把测试总数和通过数记下来，写进最终汇报。

- [ ] **步骤 5：手动验证（真实页面）**

dev 服务共用 5173 端口，用户通常自己用 `pnpm dev` 起服务。先确认端口有没有被占用（`netstat -ano | grep :5173`）：
- 已被用户的服务占用：先问用户，不要杀进程。
- 没有占用：在 worktree 里运行 `bun run dev`，打开 http://127.0.0.1:5173 。

逐项检查，每一项截图或记录现象：

1. **主题**：三段分段的切换和滑块动画正常；Tab 进入后 ←/→ 能切换主题；刷新后选择仍保留；命令面板（Ctrl+K）里「主题：深色」可用。
2. **视图切换**：外观和切换行为与改动前一致；窄屏（<1024px）只显示图标。
3. **全屏**：点击后进入全屏，图标变为收起，Esc 退出后图标恢复；命令面板里「进入全屏」可用。
4. **变更卡片**：在某个已监听项目的 `.agents/notes` 下新建一篇笔记，右上角出现一张卡片（项目色条、「新增」标签），约 6 秒后收起；鼠标停在卡片上时不收起。
5. **迁移**：把一篇笔记从 `proposed/…` 移到 `implemented/…`，卡片显示「待评审 → 已落地」。
6. **批量变更**：一次改 5 篇（新增 2、修改 2、删除 1），卡片只列前 3 处，末尾是「另有 …」。
7. **抽屉**：铃铛角标数字正确；打开抽屉后角标清零、未读卡片带「新」；「展开全部」可用；单条清除、全部清除可用；点项目名切到该项目且视图不变；点某一行打开那篇笔记；Esc 能关闭抽屉。
8. **持久化与多标签页**：刷新页面后通知仍在；开两个标签页时，同一次变更只入库一次（两边条数一致）。
9. **系统通知**：在抽屉里点「开启」并授权，然后切到别的窗口，再改一篇笔记，Windows 右下角弹出系统通知；点击后浏览器回到前台并跳到该项目。
10. **隐藏项目**：把一个项目设为隐藏，改它的笔记，不应出现任何通知。
11. **深色主题**：切到深色后，卡片色条、页眉底色、标签都清晰可读。

如有问题，按 superpowers:systematic-debugging 排查，修复后补一条回归测试再 commit。
