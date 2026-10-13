# 变更通知、主题分段切换与全屏

2026-10-12。在 `feat/vite-tailwind-ui`（`f3a984d`）基础上做三件事：

1. 顶栏主题按钮从「点击轮换」改为三段单选（跟随系统 / 浅色 / 深色），复用视图切换的滑动分段外观。
2. 实时监听到笔记变化时发通知：页面在前台弹应用内卡片，在后台发系统通知；全部收进通知抽屉（顶栏铃铛打开），可清除，点击跳到对应项目。
3. 顶栏加浏览器全屏按钮。

视觉与写法遵循 `2026-10-12-modern-ui-design-system.md`（语义令牌、`ui/` 通用组件、不写色值、不加依赖）。原型见 `.superpowers/brainstorm/`（未入库）。

## 1. 范围

**通知的事件**

| 类型 | 触发 | 卡片上的标签（`Badge` tone） |
|---|---|---|
| 新增 | 笔记 id 只在新扫描结果里 | 新增（emerald） |
| 修改 | 同 id，`hash` 变了 | 修改（blue） |
| 状态迁移 | 同一篇笔记的 `lifecycle` 字段变了（原地改 `Status` 行，或换目录后配对上的同一篇） | `待评审 → 已落地`（purple），文字取 `STATUS_LABELS` |
| 删除 | 笔记 id 只在旧扫描结果里 | 删除（rose），标题划线、不可点 |
| 异常 | `project-error`（路径失效、监听不可用转手动刷新） | 异常（amber） |
| 已恢复 | 项目从「不健康或手动刷新」回到「健康且实时监听」 | 已恢复（emerald） |

**不做**：新项目被发现的通知；隐藏项目的任何通知；页面关闭期间变更的补发（通知只在页面开着时产生）；服务端持久化通知；通知按项目筛选；提示音。

## 2. 服务端与事件格式

### 2.1 类型（`src/shared/types.ts`）

```ts
export type NoteChange =
  | { kind: 'added' | 'modified' | 'removed'; id: string; title: string; lifecycle: Lifecycle }
  | { kind: 'moved'; id: string; fromId: string; title: string; from: Lifecycle; to: Lifecycle };

export type ProjectUpdatedEvent = {
  // 现有字段不变
  /** 与上一次扫描相比的笔记变化；首次扫描、从失效恢复、无变化时不带 */
  changes?: NoteChange[];
};

export type ProjectErrorEvent = { id: string; reason: string; at: number }; // 新增 at，前端据此生成确定性通知 id
```

`moved` 的 `id` 是新 id（打开笔记用），`fromId` 是旧 id（原地改 `Status` 时两者相同）。

> `lifecycle` 取笔记的 `Status` 行，缺失时才按目录推断（`parser.ts`）；界面上的状态徽标和计数都用它，所以「状态迁移」以这个字段为准，而不是以目录为准。

### 2.2 `diffNotes(prev, next): NoteChange[]`（`src/server/store.ts`，纯函数）

1. 按 id 分出三组：只在 `next` 的为新增，只在 `prev` 的为删除，两边都有但 `hash` 不同的为修改。
2. 同一 id 的笔记 `lifecycle` 变了，记为 `moved`（`id` 等于 `fromId`），不再另记修改。
3. 跨目录配对：新增与删除两组里，id 去掉第一段（`implemented/…` → `…`）后相同的，各取出一条配成一对；同一个去首段 id 有多个候选时（如 `proposed/x` 与 `rejected/x` 都被删除），按完整 id 码点序依次配对，剩下的仍记为新增或删除。配成的一对如果 `lifecycle` 不同，记为 `moved`；相同（只换了目录、状态没变）记为 `modified`，id 取新的。
4. 输出顺序：moved → added → modified → removed；组内按 `title` 码点序，再按 `id`。结果稳定，便于测试。
5. `title` 取对应那一侧笔记的标题（删除取旧的，其余取新的）。

### 2.3 `hub.ts` 的 `scanNow`

只在 `cause !== 'initial' && current.healthy` 时调用 `diffNotes(current.notes, notes)`，结果非空才放进事件的 `changes`。理由：首次扫描的旧列表为空；`markUnhealthy` 会清空 `notes`，恢复时旧列表也为空。这两种情况算 diff 会把所有笔记都当成「新增」。`manual` 重扫照常附带。

两处 `project-error` 广播都补上 `at: Date.now()`。

## 3. 前端状态

### 3.1 通知 store（`src/client/notifications/store.ts`）

模块级 store，写法同 `theme.ts`：`useSyncExternalStore`，持久化在 `localStorage['edm-notifications']`，读写抛错时退回内存，读到损坏的 JSON 当作空列表。

```ts
export type AppNotification = {
  /** 确定性 id：`${type}:${projectId}:${at}`。多个标签页各自收到同一事件时据此去重 */
  id: string;
  projectId: string;
  /** 产生时的快照：项目被改名或移除后旧通知照常显示 */
  projectName: string;
  projectOrder: number;
  at: number;
  read: boolean;
  body:
    | { type: 'changes'; changes: NoteChange[] }
    | { type: 'error'; reason: string }
    | { type: 'recovered' };
};
```

接口：`push(n)`（id 已存在则忽略）、`dismiss(id)`、`clearAll()`、`markAllRead()`、`useNotifications(): { items, unread }`。

- 新的在前，最多 200 条，超出时丢弃最旧的。
- 通过 `storage` 事件在多个标签页之间同步。

### 3.2 事件 → 通知（`src/client/notifications/derive.ts`，纯函数）

```ts
toNotifications(event, prevMeta: ProjectMeta | undefined, lastErrors: ReadonlyMap<string, string>): AppNotification[]
```

- 项目 `hidden` 时（取事件里的新 meta，没有则取 `prevMeta`）返回空。
- `project-updated`：
  - 带非空 `changes` → 一条 `changes`，`at` 取事件的 `at`。
  - `prevMeta` 处于 `!healthy || watchMode === 'manual'`，新 meta 为 `healthy && watchMode === 'live'` → 一条 `recovered`，同时清掉该项目的 `lastErrors`。
- `project-error`：`lastErrors` 里该项目的原因与本次相同则跳过（恢复前同一异常只通知一次），否则一条 `error` 并记录原因。

摘要文案也放在这里，比如 `summarize(changes)` → `新增 1、修改 2`，以及卡片末尾的 `另有 1 处修改、1 处删除`。

### 3.3 `useHub` 接入

在已有的 `project-updated` / `project-error` 回调里，用回调执行前的 `projects` 作 `prevMeta` 调用 `toNotifications`。结果交给 `notifications/dispatch.ts`：

- 写入 store。
- 通知抽屉开着 → 新通知直接标为已读，不弹卡片。
- `document.visibilityState === 'hidden'` 时：已授权则发系统通知，否则什么也不做，只累加角标。
- 其余情况 → 加入弹出队列。

SSE 重连只做全量刷新，不补发通知。

## 4. UI

### 4.1 顶栏

从左到右：菜单（窄屏）| 品牌 | 视图切换 | 弹性空白 | 搜索 | **主题分段** | **全屏** | **铃铛** | 同步状态。

**`ui/SegmentedControl.tsx`**：从 `TopBar.tsx` 的 `ViewTabs` 抽出，滑动底板与 `ResizeObserver` 测量逻辑原样保留。

```ts
type SegmentedControlProps<T extends string> = {
  mode: 'nav' | 'radio';
  label: string;                       // aria-label
  value: T;
  options: readonly { value: T; label: string; icon: LucideIcon }[];
  onChange: (value: T) => void;
  iconOnly?: boolean | 'below-lg';     // 视图切换用 'below-lg'，主题用 true
};
```

- `nav`：`<nav>` 加按钮，选中项带 `aria-current="page"`，和现在的视图切换一致。
- `radio`：`role="radiogroup"`，每项是 `role="radio"` 加 `aria-checked`，用 roving tabindex，←/→ 移动并立即选中。
- 只显示图标时，文字放进 `sr-only` 与 `title`。

**主题**：`theme.ts` 删掉 `nextPreference` 与 `cycle`，新增 `setPreference(next)`；`useTheme()` 返回 `{ preference, setPreference }`。顶栏用 `radio` 模式、图标为 Monitor / Sun / Moon，窄屏（`max-sm`）照旧隐藏。命令面板里的「切换主题」拆成三条：「主题：跟随系统 / 浅色 / 深色」，当前项的 hint 显示「当前」。

**全屏**：`state/useFullscreen.ts`

```ts
useFullscreen(): { supported: boolean; active: boolean; toggle: () => void }
```

- 用 `document.fullscreenEnabled` 判断是否支持，`fullscreenchange` 驱动 `active`。
- `toggle` 对 `documentElement` 调 `requestFullscreen()` / `exitFullscreen()`，失败时 `toast` 提示错误。
- 按钮图标在 Maximize / Minimize 之间切换，`aria-pressed={active}`，不支持时不渲染。
- 命令面板加一条「进入全屏 / 退出全屏」。
- F11 进入的是浏览器自己的全屏，网页检测不到，按钮状态不会变，属已知限制。

**铃铛**：`Button variant="ghost" size="icon"`，`aria-label="通知，N 条未读"`。未读大于 0 时显示角标（`bg-rose-600 text-white`），超过 99 显示 `99+`。点击打开抽屉。

### 4.2 `NotificationCard`（`components/NotificationCard.tsx`）

卡片样式是原型里的 B：`rounded-xl bg-surface shadow-card ring-1 ring-line`，左侧 3px 项目色条，页眉底色是项目色按约 7% 混进 `--surface`（`color-mix`，项目色走 `style`，属于设计规范允许的动态值）。

- **页眉**：项目名；未读时加「新」徽标；变更条数加时间（今天显示 `HH:mm`，其余显示 `M月D日 HH:mm`，弹出卡片显示「刚刚」）；关闭按钮（`aria-label="清除通知"` 或 `"收起"`）。
- **正文**：每行是标签加笔记标题。新增、修改、迁移的行是按钮，点击打开笔记；删除的行是划线灰字，不可交互。
- `variant="toast"`：最多 3 行，之后显示「另有 …」汇总；底部 2px 倒计时进度条。
- `variant="drawer"`：默认 3 行，超出时显示「展开全部 N 处 ▾」，可以展开和收起。
- 点项目名：`onOpenProject(notification)`。点行：`onOpenNote(notification, noteId)`。传整条通知，是因为「项目已移除」的提示要用到快照里的项目名。

### 4.3 `NotificationStack`（`components/NotificationStack.tsx`）

- 位置在右上角：`fixed top-16 right-4 z-[60]`，宽度 `w-[min(92vw,22rem)]`，入场动画用 `animate-slide-in-right`。
- 最多同时显示 3 张，其余排队；每张 6 秒后收起。鼠标悬停或焦点在卡片内时暂停计时（两者分别跟踪，任一成立即暂停），离开后按剩余时间继续，倒计时条同步暂停。
- 外层用 `aria-live="polite"` 区域，写法同 `Toaster`。
- 卡片的 × 只把它移出弹出队列，不从 store 删除。
- 现有的 `Toaster`（右下角，用于操作回执）不动。

### 4.4 `ui/Drawer.tsx` 与 `NotificationDrawer`

把 `NoteDrawer` 里的遮罩、`aside`、`useFocusTrap`、`useDialogFocus`、`useEscapeClose` 抽成 `ui/Drawer.tsx`：

```ts
Drawer({ label, labelledBy?, width, onClose, children })
```

`NoteDrawer` 改用它，行为不变，现有测试照常通过。

**`NotificationDrawer`**（`components/NotificationDrawer.tsx`）：宽度 `w-[min(100vw,26rem)]`，底色 `bg-(--bg)`（没有 `bg-bg` 工具类，写法同 `bg-(--backdrop)`）。

- **页眉**：「通知」，`N 条`，「全部清除」（列表为空时禁用），关闭按钮。
- **系统通知条**：
  - 权限为 `default`：「页面在后台时用系统通知提醒」加「开启」按钮，点击后申请权限。
  - `granted`：「系统通知已开启」。
  - `denied`：「系统通知被浏览器拦截，可在地址栏左侧的站点设置中允许」。
  - 不支持 Notification API 时不显示这一条。
- **列表**：按「今天 / 昨天 / 更早」分组，卡片间距 `gap-2`。
- **空态**：`EmptyState compact`，显示「暂无通知」。
- 打开即调用 `markAllRead()`；打开期间到达的新通知也直接标为已读。
- **点项目名**：`navigate({ projectId, view: 当前视图, note: null })`，然后关闭抽屉。
- **点行**：`navigate({ projectId, view: 当前视图, note: noteId })`，然后关闭抽屉。笔记不存在时由 `NoteDrawer` 现有的「未找到笔记」状态兜底。
- **项目已不在 `hub.projects` 中**：`toast` 提示「项目「X」已移除」，不跳转。

通知抽屉和笔记抽屉不会同时打开：从通知打开笔记前先关闭通知抽屉。

### 4.5 系统通知（`notifications/desktop.ts`）

- `desktopPermission()`、`requestDesktopPermission()`、`showDesktopNotification(n, onClick)`。
- 标题是项目名；正文是摘要加第一处变更的标题（异常和已恢复显示原因或「实时监听已恢复」）。
- `tag: edm:${projectId}`，同一项目的新通知替换旧的。
- 点击时依次执行 `window.focus()`、跳转（规则同 4.4 的点项目名）、`notification.close()`。
- 只在页面处于后台且已授权时调用。`127.0.0.1` 属于安全上下文，可以使用 Notification API。

## 5. 边界情况

| 情况 | 处理 |
|---|---|
| 多个标签页同时开着 | 确定性 id，store 去重；系统通知靠同一个 `tag` 替换，最多重复一次 |
| `localStorage` 满了、被禁用或内容损坏 | 退回内存；损坏视为空列表 |
| 一次扫描变更很多 | 一条通知；卡片只列前 3 处；抽屉里可以展开全部 |
| 同一异常反复上报 | 恢复前只通知一次 |
| 页面在后台、未授权系统通知 | 不弹卡片，回到前台时看到角标 |
| 深色主题 | 全部用语义令牌；项目色混进 `--surface`，深浅都适用 |
| 不支持全屏或 Notification | 对应按钮或提示条不渲染 |

## 6. 测试

**服务端**
- `tests/server/store.test.ts`：`diffNotes` 覆盖增、改、删、迁移、迁移时同时修改、多篇同名不误配、输出顺序、无变化时返回空数组。
- hub 层：首次扫描不带 `changes`；文件变更带 `changes`；从失效恢复不带；`project-error` 带 `at`。
- `tests/e2e/live-sync.test.ts`：新建、修改、移动、删除笔记文件后，事件里的 `changes` 符合预期。

**前端纯逻辑**
- `tests/client/notifications-derive.test.ts`：隐藏项目跳过、恢复识别、异常去重、摘要文案。
- `tests/client/notifications-store.test.ts`：200 条上限、按 id 去重、`dismiss`、`clearAll`、`markAllRead`、`localStorage` 抛错时退回内存、损坏 JSON。
- `tests/client/theme.test.ts`：改为测 `setPreference`。

**组件**（`renderToStaticMarkup`）
- `SegmentedControl`：`radio` 模式下有 `role="radiogroup"`，选中项为 `aria-checked="true"`，只有选中项是 `tabindex="0"`；`nav` 模式下有 `aria-current`。
- `NotificationCard`：删除行不渲染为按钮；toast 变体超过 3 处时显示「另有」；drawer 变体显示「展开全部」。
- 铃铛角标：0 时不显示，100 时显示 `99+`。
- `NoteDrawer` 现有测试在改用 `ui/Drawer` 后不改动、照常通过。

**手动验证**：用 `bun run dev` 起服务，对一个真实项目的笔记目录新建、修改、移动、删除文件，确认以下各项正常：弹出卡片、角标、抽屉（展开、清除、全部清除、跳转）、后台系统通知与点击跳转、全屏切换、主题三段切换（含方向键）、深色主题下的卡片配色。
