# 多项目工程决策中心 —— 设计文档

**日期**：2026-10-12
**状态**：设计已确认，待实现
**取代**：`agent-notes-board.html`（单文件看板，浏览器端 File System Access 直读本地目录）

---

## 1. 目标与范围

### 1.1 要解决的问题

现有单文件看板 `agent-notes-board.html` 只能看**一个**项目的 `.agents/notes`。本机实际有 3 个含决策笔记的项目（Pi 35 条、gren-ssh 31 条、electron-mall-manager 62 条，共 128 条），切换项目需要手动重新授权目录，且无法同时看到多个项目的状态。

此外，现有看板的解析器存在**正文截断缺陷**（见 §4.2），导致每篇笔记的 `## Decision` 只能显示第一段。

### 1.2 目标

1. **多项目切换查看**：一次看一个项目，左栏常驻项目列表，切换零跳转
2. **文件系统实时同步**：`.agents/notes` 下任何增删改，页面自动更新，无需手动刷新
3. **单进程运行**：一条命令起服务，同时承担扫盘解析、API、事件推送、前端资源分发
4. **完整保留现有看板的功能**：四个视图、详情抽屉、全局搜索、血缘链路、全部筛选切片
5. **只读**：不改动任何笔记文件

### 1.3 明确不做（YAGNI）

| 不做 | 理由 |
|---|---|
| `docs/decisions/*.md` 收录 | Pi 项目下 171 个该格式文件，其 `README.md` 自标"已冻结只读历史，有效决策只在 `.agents/notes/`"。两套格式两套 UI，收益不匹配成本 |
| 跨项目引用解析 | 用户从未提出该需求。引用图谱保持项目内封闭，换来"改一个项目只重算它自己"的性能优势 |
| 改写笔记 / 编辑正文 | 纯只读查看。写笔记仍由 agent / 编辑器负责 |
| 导出单文件 HTML | 旧的单文件形态不再维护 |
| 前端组件单元测试 | 按 §9 的测试策略，前端靠手动验证关键路径 |
| 跨设备/多人访问鉴权 | 只监听 `127.0.0.1`。数据源层已抽象，未来加鉴权不需推倒重来 |

---

## 2. 架构

### 2.1 技术栈

| 项 | 选择 | 说明 |
|---|---|---|
| 运行时 | Bun 1.3.14 | 已装于 `D:\nvm4w\nodejs\node_modules\bun\bin\bun.exe` |
| 后端 | `Bun.serve()` 原生路由 | 无 Web 框架 |
| 前端 | React 19.3.0 + TypeScript | |
| 样式 | 原生 CSS + CSS 变量 | 从旧看板平移设计令牌 |
| 构建 | Bun 原生（`import index.html`） | 无 Vite / webpack，无构建配置 |
| 路由 | 手写 hash 路由 | 4 个视图 + 1 个抽屉，引入 react-router 不划算 |
| 字体 | 本地 4 个 woff2（约 103 KB） | 完全离线可用 |
| 测试 | `bun test` | |

### 2.2 进程模型

**单进程**。一个 `Bun.serve` 同时承担四件事：

```
bun run dev     # 开发：客户端 HMR + 服务端 --watch
bun run start   # 运行：无 HMR
```

```
┌─────────────────────── bun 进程 ───────────────────────┐
│                                                         │
│  fs.watch × N 项目 ──► 全量重扫 ──► 内存索引            │
│                                        │                │
│  /api/*  ──────────────────────────────┤                │
│  /api/events (SSE) ◄── 广播 ───────────┘                │
│  /*  ──► React 前端（HTML 转译 + JS bundle）             │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          │
                     HTTP :5173
                          │
                    ┌─────▼─────┐
                    │  浏览器    │
                    └───────────┘
```

### 2.3 目录结构

```
Engineering Decision Management\
├─ package.json
├─ tsconfig.json
├─ config.json                  唯一配置（UI 可写，也可手编）
├─ .gitignore
├─ src\
│  ├─ server\
│  │  ├─ main.ts                入口：Bun.serve 装配
│  │  ├─ config.ts              config.json 读写（原子替换）
│  │  ├─ discovery.ts           扫描根目录发现项目
│  │  ├─ parser.ts              单篇笔记 → NoteDoc
│  │  ├─ scan.ts                目录遍历 + 批量解析
│  │  ├─ store.ts               内存索引 + 引用图谱
│  │  ├─ watcher.ts             fs.watch 生命周期 + debounce
│  │  ├─ events.ts              SSE 广播与心跳
│  │  └─ api.ts                 路由处理器
│  ├─ shared\
│  │  └─ types.ts               前后端共用类型（单一真相）
│  └─ client\
│     ├─ main.tsx
│     ├─ App.tsx
│     ├─ router.ts              hash 路由解析/生成
│     ├─ state\                 per-project 状态层
│     ├─ styles\
│     │  ├─ tokens.css          设计令牌
│     │  └─ fonts.css           @font-face
│     ├─ assets\fonts\          4 个 woff2
│     ├─ components\            TopBar / ProjectRail / KpiRow / Badge / NoteDrawer / SearchPopover / MarkdownBody / LineageChips
│     └─ views\                 BaselineView / TimelineView / AlternativesView / DirectoryView
├─ tests\
└─ docs\superpowers\specs\
```

---

## 3. 配置

### 3.1 `config.json`

```json
{
  "port": 5173,
  "scanRoots": ["D:\\OneDrive\\Project Files"],
  "scanDepth": 2,
  "projects": [
    { "path": "D:\\OneDrive\\Project Files\\Pi", "name": null, "hidden": false }
  ],
  "watch": { "debounceMs": 150, "rescanRootsMs": 60000 }
}
```

| 字段 | 含义 |
|---|---|
| `port` | 监听端口，仅绑定 `127.0.0.1` |
| `scanRoots` | 启动时递归发现项目的根目录列表 |
| `scanDepth` | 递归深度上限 |
| `projects` | 手动添加的项目 + 隐藏标记。`name: null` 表示用文件夹名 |
| `watch.debounceMs` | 文件事件合并窗口 |
| `watch.rescanRootsMs` | 定期重扫 `scanRoots` 找新项目的间隔 |

### 3.2 写盘策略

读-改-写 + **原子替换**：写临时文件 → `rename` 覆盖。避免 UI 写入与用户手动编辑冲突时产生半截文件。

### 3.3 损坏处理

`config.json` 解析失败时**使用内置默认值并记录错误日志，绝不覆盖用户文件**。用户修好后下次启动即生效。

---

## 4. 数据层

### 4.1 笔记发现规则

从每个项目的 `.agents/notes` 起递归遍历：

- 跳过所有以 `.` 开头的条目
- 只收 `.md` 文件
- 相对路径必须**至少三段**且第一段属于 `implemented | proposed | rejected | archived`
- `.zh.md` 变体归一化为 `.md`（同 ID 时以 `.zh.md` 内容为准，与旧看板一致）

### 4.2 解析器（修正旧缺陷）

**旧缺陷实测证据**：旧正则 `^## (?:P)\s*\n+([\s\S]*?)(?=^## |\s*$)` 中的 `\s*$` 在 `m` 模式下匹配任意行行尾，非贪婪量词随即在第一个空行处停止。

对真实笔记 `2026-06-15-control-plane-via-runtime-settings.md`：

| 章节 | 旧正则抽出 | 实际应有 |
|---|---|---|
| `## Decision` | 102 字符（止于首个空行） | **459 字符**（含 `### 涉及文件`、`### 来源` 子节） |

新版正则改为 `(?=^## |(?![\s\S]))`，并且**保留 `###` 子节**。注意**不能使用 `\Z`** —— JavaScript 正则不支持该锚点，详见下节。

#### 解析产物

```typescript
type NoteDoc = {
  id: string;            // 相对 notes 根的路径，如 implemented/architecture/2026-06-15-xxx.md
  slug: string;          // 文件名去掉 .md
  lifecycle: 'implemented' | 'proposed' | 'rejected' | 'archived';
  cls: string;           // architecture | feature | bug-fix | simplification | process | testing
  date: string;          // 从 slug 前缀提取 YYYY-MM-DD，无则空串
  title: string;         // # Agent Note: 之后的内容
  verdict: string;       // Status 行破折号之后的长原因（仅 rejected 通常有）
  problem: string;
  decision: string;
  alternatives: string;
  consequences: string;
  extraSections: { heading: string; body: string }[];  // 四段之外的 ## 章节，按原顺序
  links: LinkResult[];
  rawBody: string;       // 仅详情接口返回
}
```

#### 章节抽取正则（关键：不能用 `\Z`）

**JavaScript 正则没有 `\Z` 锚点**（那是 PCRE 语法）。JS 会把 `\Z` 当作**字面字符 `Z`**，已实测确认：

```
/\Z/.source === "\\Z"      // 未被识别为锚点
/\Z/.test("Z") === true    // 匹配的是字母 Z
```

后果实测：抽取末节时若正文含大写 `Z`（如 `Zustand`、`Zod`、`ZeroMQ`，在真实笔记里很常见），正则找不到结尾锚点，**返回 NO MATCH，整个章节内容丢失**：

```javascript
// 错误写法 —— 末节抽取返回 NO MATCH
const re = /^## Alternatives considered\s*\n+([\s\S]*?)(?=^## |\Z)/m
// 实测结果：NO MATCH（因为正文里的 "Zustand" 让引擎在错误位置找字面 Z）

// 正确写法 —— 用 (?![\s\S]) 表示「字符串结尾」
const SEC_RE = (p: string) =>
  new RegExp(`^## (?:${p})\\s*\\n+([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm')
// 实测结果："备选。\n"
```

**同时这也修正了旧看板的截断缺陷**：旧正则用 `(?=^## |\s*$)`，其中 `\s*$` 在 `m` 模式下匹配任意行行尾，非贪婪量词随即在第一个空行处停止。新正则用 `(?=^## |(?![\s\S]))`，只在下一个 `##` 标题或字符串结尾处停止。

对真实笔记 `2026-06-15-control-plane-via-runtime-settings.md`：

| 章节 | 旧正则抽出 | 新正则抽出 |
|---|---|---|
| `## Problem` | 88 字符（恰好单段，未暴露问题） | 88 字符 |
| `## Decision` | **102 字符**（止于首个空行） | **459 字符**（含 `### 涉及文件`、`### 来源` 子节） |

#### `Status:` 行解析

```typescript
const m = /^Status:\s*([a-z-]+)\s*(?:[—–-]\s*([\s\S]*?))?\s*$/m.exec(parseable)
```

- 第一捕获组 → `lifecycle`
- 第二捕获组 → `verdict`，**单独存字段，不在列表显示，只在详情抽屉顶部显示**

实测 5 条 `rejected` 带长 verdict，内容含 markdown 链接，必须完整保留。

#### 自由章节处理

除四段外的 `##` 章节按原顺序收集进 `extraSections`，在详情抽屉四段之后原样渲染。

实测非标准章节分布：`Verification` ×82、`验证` ×37、`Risks` ×14、`Acceptance criteria` ×10、`原始记录（合并自 docs/decisions）` ×5、`待确认` ×3、`决定汇总（用户确认）` ×1、`Wire 契约` ×1。

#### 围栏代码块处理

解析结构（`##` 标题、`.md` 链接）前先剥离 ``` 围栏内的内容，避免代码块里的标题和链接被误认为笔记结构。

### 4.3 链接解析（三态）

```typescript
type LinkResult =
  | { kind: 'resolved';   targetId: string;  anchor: string }
  | { kind: 'external';   rawHref: string;   anchor: string }
  | { kind: 'unresolved'; rawHref: string;   anchor: string }
```

解析流程：以 `{lifecycle}/{cls}/` 为基准做路径归一化（处理 `../` 与 `./`），然后：

| 结果 | 判定条件 | 计入引用度数 | UI 呈现 |
|---|---|---|---|
| `resolved` | 归一化路径命中本项目 `byId`；未命中则退回按 slug 匹配 | 是 | 可点击跳转 |
| `external` | 归一化后路径**超出 notes 根**（如 `../../../../docs/decisions/...`） | 否 | 灰色标签「↗ 外部引用」 |
| `unresolved` | 在本项目内但找不到目标 | 否 | 红色警告「⚠ 断链」 |

**不跨项目解析**：即使 Pi 的笔记引用了 gren-ssh 的笔记，也只标记为 `unresolved`。

实测数据：Pi 项目有 5 处 `external` 类型链接指向 `docs/decisions/`；旧看板会静默丢弃这些链接，新版必须显示。

### 4.4 引用图谱

```
inCount: Map<noteId, number>    // 被引用次数，承重墙排序依据
```

**项目内封闭** ⇒ 变更单个项目时只需重算该项目的 `inCount`，其他项目完全不动。

### 4.5 性能实测（决定「不做增量 diff」）

3 个项目 128 条笔记的实测：

| 项目 | 扫描耗时 |
|---|---|
| Pi（35 条） | 14 ms |
| gren-ssh（31 条） | 7.6 ms |
| electron-mall-manager（62 条） | 16.2 ms |
| **合计** | **约 30 ms**（遍历 9.4 ms + 解析 20.6 ms） |

单项目重扫实测 16.4 ~ 20.9 ms。

**结论：文件一变就全量重扫该项目并全量推送。** 30 ms 重建整份索引比维护增量状态机更简单、更不易出错。

### 4.6 序列化体积

| 内容 | 大小 |
|---|---|
| 128 条含 `rawBody` | 400.8 KB |
| 128 条不含 `rawBody` | 91.4 KB |

**列表接口不返回 `rawBody`**，详情接口才返回。列表视图用不到原文。

---

## 5. 服务端

### 5.1 内存模型

```typescript
Map<projectId, ProjectIndex>

type ProjectIndex = {
  id: string;                      // 文件夹名
  path: string;                    // 绝对路径
  displayName: string;             // name ?? 文件夹名
  source: 'discovered' | 'manual'; // 决定能否删除
  healthy: boolean;                // 路径失效 / watch 失败时为 false
  watchMode: 'live' | 'manual';    // 实时 / 降级为手动刷新
  notes: NoteDoc[];
  byId: Map<string, NoteDoc>;
  inCount: Map<string, number>;
  scannedAt: number;               // 最近一次扫描完成时间
  fileEventAt: number;             // 最近一次由真实文件事件触发的扫描时间（用于左栏新鲜度排序）
  scanMs: number;
}
```

### 5.2 项目发现

启动流程：

```
读 config.json
  → 遍历 scanRoots（深度 ≤ scanDepth）找含 .agents/notes 的目录 → source='discovered'
  → 合并 config.projects 手动项 → source='manual'
  → 去重（同路径优先 manual）
  → 每个项目跑一次全量扫描 + 建立 fs.watch
```

**定期重扫**：每 `rescanRootsMs`（默认 60 s）重扫 `scanRoots` 的**目录结构**（不解析笔记）以发现新项目。开销极小。

**新项目出现时**：加入内存索引 → 建 watch → 全量扫描一次 → 广播 `config-changed`，左栏自动出现。

### 5.3 项目排序

左栏按**最近变动时间倒序**（新增或修改过笔记的项目排最上）。变动时间取 `fileEventAt`（仅由真实文件事件触发的扫描才更新），从未收到过文件事件的项目回落到笔记 `date` 的最大值。这样「定期重扫根目录发现新项目」这类内部扫描不会把项目错误地顶到最前。

### 5.4 项目颜色

按发现顺序从固定色板循环分配，仅前端展示，不落盘：

```typescript
const PALETTE = ['#7C3AED', '#1D4ED8', '#0D9488', '#D97706', '#DC2626', '#0891B2']
```

### 5.5 API

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/config` | 配置 + 项目清单（含各项目元数据与健康状态） |
| `POST` | `/api/projects` | 添加项目路径：写 config.json → 扫描 → 建 watch → 广播 |
| `DELETE` | `/api/projects/:id` | 移除手动添加的项目 |
| `PATCH` | `/api/projects/:id` | 修改显示名 / 隐藏标记 |
| `POST` | `/api/projects/:id/rescan` | 手动触发重扫（供手动刷新模式的降级 UI 使用） |
| `GET` | `/api/projects/:id/notes` | 该项目全部笔记（**不含 `rawBody`**） |
| `GET` | `/api/projects/:id/notes/:noteId` | 单篇完整内容（含 `rawBody` + 链接解析） |
| `GET` | `/api/events` | SSE 事件流 |

**说明**：项目健康状态与 `watchMode` 随 `GET /api/config` 一起返回，不单设状态接口，避免前端多一次往返。

### 5.6 SSE 事件

| 事件 | 载荷 | 前端动作 |
|---|---|---|
| `connected` | `{ clientId }` | 顶栏信标转「实时同步中」 |
| `project-updated` | `{ id, count, delta, scanMs, at }` | 见 §6.4 |
| `config-changed` | `{ projects }` | 刷新左栏 |
| `project-error` | `{ id, reason }` | 该项目灰显 + 错误标签 |

**心跳**：每 15 s 发 `: keepalive` 注释行防中间层断连。响应头带 `Cache-Control: no-store`。

### 5.7 错误处理

| 场景 | 处理 |
|---|---|
| 项目路径不存在 / 无 `.agents/notes` | 该项目 `healthy=false`，左栏灰显 +「路径失效」标签，**不阻塞其他项目** |
| 单篇笔记读取失败（权限/编码） | 跳过该篇，`console.warn`，其余照常显示 |
| 笔记缺 `Status:` 行 | 降级：用文件夹名推断 lifecycle，标题回落为 slug |
| 笔记缺四个固定章节 | 该段留空，抽屉显示占位文案（沿用旧看板文案） |
| `fs.watch` 建立失败 | 该项目 `watchMode='manual'`，广播 `project-error`，UI 提供手动刷新按钮 |
| `config.json` 损坏 | 用默认值 + 日志报错，**不覆盖用户文件** |
| SSE 断连 | `EventSource` 自动重连；重连后全量 refetch |

---

## 6. 前端

### 6.1 布局（用户已确认）

**忠实保留原有视觉设计（瑞士工程图纸风），唯一的结构改动是在最左侧加入项目栏。**

```
┌──────────────────────────────────────────────────────────────────┐
│ [logo] 工程决策中心 [chip]  │ 🏛️基线 ⏱️时间线 🛡️避坑 📋清单 │ 🔍 / │ ● 实时 │  ← 顶栏（原生）
├────────────┬─────────────────────────────────────────────────────┤
│ 项目 3     │  KPI 阵列（4 张仪表卡）                              │
│            │                                                     │
│ Pi ●       │  ┌── 系统承重墙（瀑布卡）──────────────────────┐    │
│ 35 条 3h前 │  │                                              │    │
│ ▓▓▓▓▒▒░    │  └──────────────────────────────────────────────┘    │
│            │                                                     │
│ gren-ssh   │  ┌── 领域架构分类阵列（四列）──────────────────┐    │
│ 31 条 昨天 │  │                                              │    │
│ ▓▓▓▓▒      │  └──────────────────────────────────────────────┘    │
│            │                                                     │
│ mall-mgr   │                                                     │
│ 62 条 2天前 │                                                     │
│ ▓▓▓▓▓▒▒░   │                                                     │
│            │                                                     │
│ + 添加路径  │                                                     │
└────────────┴─────────────────────────────────────────────────────┘
   ↑ 新增左栏 186px          ↑ 原生画布（padding 28px 36px, max-width 1440px）
```

**左栏条目内容**（用户已确认方案 A）：

- 项目名（`--font-display`，600 字重）
- 条数 + 新鲜度（`--font-mono` 11px，如「35 条 · 3h 前」）
- 状态占比条：4 段小条，颜色 = 落地绿 / 待评审黄 / 否决红 / 归档灰，宽度按条数比例
- 活跃项目的绿点（`--emerald-live`）
- **不重复「视图」导航**（顶栏 tab 已负责）

**选中态**：`background: #EFF6FF; border-color: #BFDBFE; box-shadow: inset 2px 0 0 var(--brand-blue)`

### 6.2 组件树

```
<App>
├─ <TopBar>              品牌 · 项目计数 chip · 4 视图 Tab · 搜索框 · 实时信标
│   └─ <SearchPopover>   即时下拉（/ 聚焦，↑↓ 选择，↵ 打开，Esc 关闭）
├─ <Shell>
│   ├─ <ProjectRail>     项目条目 · + 添加项目
│   └─ <Canvas>
│       ├─ <BaselineView>      KpiRow · PillarsVault · MatrixChambers
│       ├─ <TimelineView>      MonthPills · ClassPills · ChronoTrack
│       ├─ <AlternativesView>  AltSearch · PitfallsGrid
│       └─ <DirectoryView>     MatrixToolbar · MatrixBoard
└─ <NoteDrawer>          详情抽屉
   ├─ <MarkdownBody>     轻量 Markdown 渲染
   └─ <LineageChips>     前置依据 / 派生影响 / 外部引用 / 断链
```

### 6.3 状态与路由

#### URL 形态

```
#Pi/baseline                                  项目 Pi 的架构基线视图
#Pi/timeline                                  时间线
#Pi/baseline/note=2026-10-11-subagent-redesign   抽屉打开中
```

使用 `history.replaceState`（不用 pushState），避免后退键刷屏，与旧看板一致。非法 hash 回落 `#<首个项目>/baseline`。

#### 状态归属

| 状态 | 位置 | 理由 |
|---|---|---|
| 当前项目 id | URL hash | 可分享、刷新恢复 |
| 当前视图 | URL hash | 同上 |
| 打开的笔记 id | URL hash | 保留旧看板的深链能力 |
| 全局搜索词 | App state | 输入态，无需持久 |
| 视图内筛选 | per-project 状态层 | 见下 |
| 笔记数据 | 服务端 + 客户端缓存 | SSE 驱动失效 |

#### 筛选状态规则

| 操作 | 筛选行为 | 理由 |
|---|---|---|
| 切**视图**（基线 ↔ 时间线 ↔ …） | **保留** | 与旧看板一致 |
| 切**项目** | **重置** | 新项目的年份/分类取值可能不存在，粘过去会得到空列表 |

旧看板把筛选存在全局对象里，切项目时会错误地粘在新项目上，新版修正此行为。

### 6.4 实时同步的前端行为

| 事件 | 前端动作 |
|---|---|
| `project-updated`，**是当前项目** | 后台 refetch 笔记 → 拿到新数据后**原子替换**，不显示骨架 |
| `project-updated`，**非当前项目** | 只更新左栏该项目的条数 / 新鲜度 / 占比条 |
| `config-changed` | 刷新左栏项目列表 |
| `project-error` | 该项目灰显 + 错误标签 |
| SSE 重连 | 全量 refetch 一次 |

**refetch 时保留旧数据渲染**，不用 loading 骨架打断阅读。骨架只在首次进入项目时出现。

**正在阅读的笔记被改动时**：不自动替换抽屉正文（阅读中的文字跳变很难受），改为在抽屉顶部浮出提示条「此笔记已更新 · 点击刷新」，由用户决定何时刷新。

### 6.5 保留功能清单

以下功能从旧看板完整搬运：

| 功能 | 说明 |
|---|---|
| KPI 卡点击跳转 | 点击 → 切到决策清单并施加对应筛选 |
| 时间线双层筛选 | 月份胶囊 × 分类胶囊正交组合 |
| 避坑智库检索 | 独立搜索框，检索备选方案的放弃理由 |
| 决策清单三维筛选 | 状态 / 分类 / 排序（最新、最早、引用最多） |
| 详情抽屉五段 | 背景痛点 / 落地裁定 / 放弃备选 / 收益代价 / 血缘链路 |
| 复制反向代码注释 | `// Note: 见 .agents/notes/<id>` 一键复制 |
| 全局搜索 | `/` 聚焦，↑↓ 选择，↵ 打开，Esc 关闭，浮层显示前 7 条 |
| 血缘链路 | 前置先决依据（出链） / 派生制约影响（入链） |
| 深链 | `#note=<id>` 直接打开抽屉 |

### 6.6 修正项

| 项 | 旧行为 | 新行为 |
|---|---|---|
| 正文截断 | `## Decision` 只显示第一段 | 完整抽取（§4.2） |
| 末节含 `Z` 时丢失 | —（旧正则的 `\s*$` 掩盖了该问题） | 用 `(?![\s\S])` 作结尾锚点，不受正文内容影响 |
| 自由章节丢失 | `### 涉及文件` 等不显示 | 收进 `extraSections` 并在四段后渲染 |
| 外部引用 | 静默丢弃 | 灰色标签「↗ 外部引用」 |
| 断链 | 静默丢弃 | 红色警告「⚠ 断链」 |
| rejected 长原因 | 用 `split('\n')[2]` 脆弱提取 | 结构化 `verdict` 字段 |
| KPI 跳转实现 | 绕一圈清空各控件 DOM | 直接设状态 |
| 失效 CSS 变量 | `--brand-cyan` 被引用 2 处但从未定义 | 补齐定义 |
| 切项目筛选 | 错误粘连 | 重置 |

### 6.7 样式

从旧看板平移设计令牌到 `src/client/styles/tokens.css`：

```css
:root {
  --bg-base: #F8FAFC;
  --bg-surface: #FFFFFF;
  --border-normal: #E2E8F0;
  --border-subtle: #F1F5F9;
  --text-primary: #0F172A;
  --text-secondary: #475569;
  --text-tertiary: #94A3B8;
  --brand-blue: #1D4ED8;
  --emerald-live: #059669;
  --amber-core: #D97706;
  --alert-ruby: #DC2626;
  --teal-prune: #0D9488;
  --purple-meta: #7C3AED;
  --font-display: "Space Grotesk", -apple-system, sans-serif;
  --font-body: "Plus Jakarta Sans", -apple-system, "PingFang SC", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
}
```

页面背景保留瑞士工程图纸微网格：

```css
background-image:
  linear-gradient(to right, rgba(15,23,42,.035) 1px, transparent 1px),
  linear-gradient(to bottom, rgba(15,23,42,.035) 1px, transparent 1px);
background-size: 28px 28px;
```

#### 字体本地化

实测发现 Google Fonts 的 latin 子集对这三个字体是**可变字体**：同一 URL 覆盖全部字重（MD5 完全相同）。

| 文件 | 大小 | 覆盖 |
|---|---|---|
| `SpaceGrotesk-latin.woff2` | 22.3 KB | 字重 300–700 |
| `PlusJakartaSans-latin.woff2` | 27.3 KB | 字重 200–800 |
| `JetBrainsMono-latin.woff2` | 31.4 KB | 字重 100–800 |
| `JetBrainsMono-Italic-latin.woff2` | 22.2 KB | 斜体 100–800 |
| **合计** | **约 103 KB** | |

用 `font-weight: 100 900` 声明可变字重范围。**不引 Google Fonts CDN**，完全离线可用。

**中文处理**：字体栈回落 `PingFang SC` / `Microsoft YaHei` 等系统字体。中文字体不做本地化——最小可用子集也有 2–5 MB，且旧设计本就是「英文数字用 Space Grotesk、中文回落系统字体」的层次，本地化反而破坏该层次。

---

## 7. 实时同步完整时序

```
        agent / 编辑器写 .agents/notes/**/*.md
                        │
                        ▼  fs.watch(dir, { recursive: true })
              ┌─────────────────────┐
              │  debounce 150ms     │  合并连续事件
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │ 全量重扫「仅变更的  │  实测 7.6 ~ 20.9 ms
              │ 那个项目」          │
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │ 重算该项目 inCount  │
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │ SSE broadcast       │
              │ project-updated     │
              └──────────┬──────────┘
                         ▼
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   当前项目                           非当前项目
   → refetch → 原子替换               → 只更新左栏元数据
   → 抽屉开着且该篇被改？
     → 顶部提示条「已更新 · 点击刷新」
```

### 7.1 降级路径

| 情况 | 降级 |
|---|---|
| `fs.watch` 建立失败 | 该项目标记「手动刷新模式」，顶栏信标变灰，UI 提供刷新按钮 |
| SSE 断连 | `EventSource` 自动重连，重连后全量 refetch |
| 浏览器不支持 `EventSource` | 降级为 30 s 轮询 |

### 7.2 已实测验证的技术假设

| 假设 | 实测结果 |
|---|---|
| Windows 上 `fs.watch` 支持 recursive | **支持**。深层文件改动、新建、删除、新建子目录全部触发 |
| 连续写盘的雪崩 | debounce 150 ms 后合并成 **2 个原始事件 → 1 次重扫** |
| 编辑器「临时文件 + 重命名」写法 | `rename` 事件正常触发 |
| OneDrive 云端占位符导致读到空文件 | 实测笔记全是本地实体（无 reparse point） |
| Bun `Bun.serve` + HTML import | 正常：HTML 转译、1.16 MB client bundle 产出、`development.hmr` 可用 |
| Bun SSE 真流式 | 正常：事件按秒逐个到达，非缓冲后一次性返回 |
| 端到端链路 | 文件写入 → watch → debounce → 重扫（16.4 ms）→ SSE → 客户端收到 `project-updated`，**全链路跑通** |

---

## 8. 实现注意事项

### 8.1 OneDrive 与 `node_modules`

应用目录位于 OneDrive 同步范围内，安装依赖会产生大量同步流量。

**实现时需**：检查 OneDrive 排除配置，并在 README 中给出操作说明。若检测到 `node_modules` 未被排除，给出提示（不自动修改 OneDrive 配置）。

### 8.2 真实数据快照（测试基准）

实现时的已知状态（**注意：数据在实时变动，测试断言应使用结构性条件而非硬编码条数**）：

| 项目 | 笔记数 | lifecycle 分布（实测） |
|---|---|---|
| Pi | 35 | implemented 33 / proposed 1 / rejected 1 |
| gren-ssh | 31 | implemented 30 / proposed 1 / rejected 0 |
| electron-mall-manager | 62 | implemented 51 / proposed 7 / rejected 4 |
| **合计** | **128** | implemented 114 / proposed 9 / rejected 5 / archived 0 |

全局：128 条。class 分布：architecture 76 / feature 30 / process 12 / bug-fix 4 / simplification 3 / testing 3。

数据完整性：缺 H1 标题 0 条；缺 `Status:` 行 0 条；缺 `## Problem` 0 条；缺 `## Decision` 0 条；缺 `## Alternatives considered` 0 条；缺 `## Consequences` 14 条。

> 开发期间实测到 `electron-mall-manager` 的条数在几分钟内从 61 变为 62，说明有 agent 正在写入。这印证了实时同步的必要性，也意味着测试必须容忍条数变化。

---

## 9. 测试策略

| 层次 | 内容 | 工具 |
|---|---|---|
| 单元 | 解析器（四段抽取、`Status:` 破折号 verdict、自由章节、围栏剥离）、链接三态判定、引用图谱、config 读写与原子替换 | `bun test` |
| 集成 | 扫描真实笔记目录 → 断言结构（每篇必有 id/lifecycle/title）、生命周目录白名单、引用图谱自洽（无跨项目边） | `bun test` |
| 端到端 | 起服务 → 写临时笔记文件 → 断言 SSE 收到 `project-updated` → 断言条数变化 → 清理 | `bun test` |
| 前端 | **不写组件单测**，关键路径手动验证 | — |

### 9.1 解析器回归用例（必须覆盖）

| 用例 | 断言 |
|---|---|
| 多段 `## Decision` | 抽取长度 > 400 字符（针对 §4.2 的截断缺陷） |
| `## Decision` 含 `###` 子节 | 子节内容包含在抽取结果内 |
| **末节正文含大写 `Z`**（如 `Zustand`） | **正常抽取，非 NO MATCH**（针对 `\Z` 锚点陷阱） |
| 末节无后续 `##` 标题 | 抽取到字符串结尾 |
| `Status: rejected — 长原因` | `lifecycle === 'rejected'` 且 `verdict` 非空且与原因文本一致 |
| `Status: implemented` | `verdict === ''` |
| 围栏代码块内的 `## 标题` | 不被当作章节 |
| 围栏代码块内的 `.md` 链接 | 不计入引用图谱 |
| `../../implemented/architecture/xxx.md` | `kind === 'resolved'` |
| `../feature/xxx.md`（同生命周期跨分类） | `kind === 'resolved'` |
| `../../../../docs/decisions/xxx.md` | `kind === 'external'` |
| `./nonexistent.md` | `kind === 'unresolved'` |
| 链接带 `#anchor` 后缀 | `anchor` 被剥离，`targetId` 正确 |

---

## 10. 交付物

| 文件 | 说明 |
|---|---|
| `src/**` | 服务端 + 共享类型 + 前端 |
| `config.json` | 默认配置 |
| `package.json` | `dev` / `start` / `test` 脚本 |
| `tsconfig.json` | TypeScript 配置 |
| `README.md` | 启动方式、配置说明、OneDrive 注意事项 |
| `tests/**` | 测试 |
| `docs/superpowers/specs/2026-10-12-multi-project-decision-hub-design.md` | 本文档 |
