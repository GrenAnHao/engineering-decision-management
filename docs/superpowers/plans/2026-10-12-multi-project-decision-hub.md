# 多项目工程决策中心 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 用一个 Bun 进程实现多项目 `.agents/notes` 决策看板：扫盘解析、REST API、SSE 实时推送、React 前端，完整保留旧看板 `agent-notes-board.html` 的四个视图与详情抽屉，并修正其解析缺陷。

**架构：** 服务端由纯函数模块（parser → links → scan → store）构成数据层，`Hub` 类负责项目发现、`fs.watch` 生命周期、配置读写与 SSE 广播，`api.ts` 把 Hub 暴露为 `Bun.serve` 路由；文件一变就全量重扫该项目（实测 7–20 ms）并推送 `project-updated`。前端是 React 19 SPA，hash 路由，视图计算全部放在可单测的纯函数（`derive.ts`）里，组件只负责渲染。

**技术栈：** Bun 1.3.14（`Bun.serve` 路由 + HTML import 打包）、React 19.3.0、TypeScript 7.0.2（仅类型检查）、原生 CSS、`bun test`。

**规格：** `docs/superpowers/specs/2026-10-12-multi-project-decision-hub-design.md`

---

## 实现前已验证的事实

本计划中的全部代码已在临时目录完整跑通：**15 个测试文件、115 个测试全部通过，`tsc --noEmit` 零错误**，并在浏览器里用真实的 3 个项目验证过抽屉、verdict、血缘、实时更新提示条、KPI 跳转、筛选保留 / 重置。执行时按任务顺序原样落地即可。

探针实测得到、直接影响代码的 Bun 行为：

| 事实 | 对代码的影响 |
|---|---|
| `Bun.serve` 默认 10 s 空闲超时会掐断 SSE（早于 15 s 心跳） | `/api/events` 处理器里必须先 `server.timeout(req, 0)` |
| 路由 `:noteId` 参数会自动解码 `%2F` | 笔记 id 用 `encodeURIComponent` 塞进单个路径段；`*` 通配符拿不到参数，不要用 |
| Windows 上 `fs.watch(recursive)` 回调的文件名用反斜杠，新建子目录也会触发 | watcher 不解析文件名，任何事件都只触发 debounce 后的全量重扫 |
| 目录联接（junction）在 `lstat` 下 `isSymbolicLink() === true`；`bun install` 会沿用已存在的 junction | OneDrive 检测据此判断 `node_modules` 是否已移出同步目录 |
| 小字体文件会被 Bun 打包器内联成 data URL | 无需额外静态资源路由 |
| 真实笔记中有 3 篇是 CRLF 换行；proposed/rejected 笔记用 `## Proposal` 代替 `## Decision` | 解析前归一化换行；`Proposal` 视同 Decision |

## 与规格的偏差（均为实现细节，需知悉）

1. **`LinkResult` 的 `resolved` 分支也带 `rawHref`**：前端要把正文里的 `<a href>` 对应回解析结果。
2. **`NoteDoc` 新增 `hash`**（原文哈希）：抽屉据此判断「正在阅读的笔记被改动」，比逐字段比较可靠。
3. **章节切分**：在「围栏已遮罩」的文本上找 `^## ` 标题，按位置切原文。语义与规格 §4.2 的 `(?=^## |(?![\s\S]))` 相同（止于下一个 `##` 或字符串结尾，保留 `###` 子节，不受正文 `Z` 影响），同时满足「围栏内的 `##` 不算章节、但代码块保留在正文里」。
4. **项目来源**：同一路径既被发现、又在 `config.projects` 中出现时，`source` 仍为 `discovered`，名称 / 隐藏取配置（配置优先）。只有纯手动添加的项目可以 DELETE，自动发现的只能隐藏（规格 §5.2 的「同路径优先 manual」按此理解）。
5. **`project-updated` 载荷多带 `project: ProjectMeta`**，非当前项目的左栏元数据直接用它更新，无需再请求。
6. **左栏绿点**表示「实时监听中且路径健康」；分类阵列沿用旧看板的 3 列响应式网格（规格示意图写的「四列」是草图）。
7. **深链**生成时优先用 slug（规格示例的形态），slug 在项目内不唯一时用完整 id；解析两者都接受，并兼容旧看板的 `#note=<id>`。
8. **安全**：所有 `/api/*` 校验 Host 为本机、Origin 缺省或同源（防 DNS 重绑定与跨站写配置）。
9. 规格 §4.2 表中「`## Problem` 新正则 88 字符」已过时：该笔记 Problem 有两段，正确抽取为 124 字符（Decision 459 字符与规格一致）。

## 约定

- 所有命令在仓库根目录 `D:\OneDrive\Project Files\Engineering Decision Management` 下的 Git Bash 中执行。
- **只读红线**：任何测试和手动验证都不得写入真实项目的 `.agents/notes`。测试只在系统临时目录建 fixture。
- 前端组件不写单测（规格 §9）；前端的纯逻辑（路由、格式化、视图计算、Markdown 解析）有单测。组件任务以 `bun run typecheck` 通过为准，最后统一手动验证。
- 当前在 `master` 分支。开始前按 superpowers:using-git-worktrees 建隔离工作区，或至少 `git switch -c feat/decision-hub`。

---

## 文件结构

```
package.json / tsconfig.json / config.json / README.md
scripts/fetch-fonts.ts              一次性下载本地字体
src/shared/types.ts                 前后端共用类型（单一真相）
src/server/
  parser.ts      单篇笔记 → 结构化文档（章节、Status、标题、原始链接）
  links.ts       原始链接 → 三态 LinkResult（resolved / external / unresolved）
  scan.ts        遍历 notes 目录、批量解析、排序
  store.ts       ProjectIndex 纯函数：引用计数、扫描结果合并、元数据投影
  config.ts      config.json 读取 / 校验 / 原子写 / 串行更新
  discovery.ts   扫描根下发现项目、与配置合并、分配 id
  watcher.ts     fs.watch + debounce
  events.ts      SSE 广播器与心跳
  hub.ts         状态中心：对账项目、排队重扫、监听降级、项目增删改
  api.ts         路由处理器 + 本机同源校验
  app.ts         组装 Bun.serve（测试可不挂前端）
  onedrive.ts    node_modules 同步检测
  main.ts        入口
src/client/
  index.html / main.tsx / App.tsx
  api.ts         fetch 封装
  router.ts      hash 路由解析 / 生成
  format.ts      相对时间、Markdown 转纯文本
  labels.ts      状态 / 分类中文名、配色
  derive.ts      四个视图与抽屉的纯计算
  markdown.ts    轻量 Markdown → AST
  state/         filters.ts（筛选 reducer）、useHub.ts（项目 + SSE）、useProjectNotes.ts、useHashRoute.ts
  components/    Badge、MarkdownBody、KpiRow、SearchPopover、TopBar、ProjectRail、LineageChips、NoteDrawer
  views/         BaselineView、TimelineView、AlternativesView、DirectoryView、Workspace（按项目隔离筛选）
  styles/        tokens.css、fonts.css、app.css（旧看板平移）、shell.css（左栏等新增）、drawer.css
  assets/fonts/  4 个 woff2
tests/
  helpers/       fixture.ts（临时项目）、server.ts（起测试服务 + 读 SSE）
  server/        各模块单测 + api.test.ts（集成）
  e2e/           live-sync.test.ts（写文件 → SSE → 条数变化）
  integration/   real-notes.test.ts（扫描本机真实笔记，结构性断言）
  client/        router / derive / markdown 纯逻辑单测
```

---

### 任务 1：项目脚手架

**文件：**
- 创建：`package.json`
- 创建：`tsconfig.json`
- 创建：`config.json`
- 修改：`.gitignore`

- [ ] **步骤 1：创建 `package.json`**

```json
{
  "name": "engineering-decision-hub",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/server/main.ts",
    "start": "bun src/server/main.ts --prod",
    "test": "bun test",
    "typecheck": "tsc --noEmit -p .",
    "fonts": "bun scripts/fetch-fonts.ts"
  },
  "dependencies": {
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@types/bun": "1.3.14",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "typescript": "7.0.2"
  }
}
```

- [ ] **步骤 2：创建 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["bun"]
  },
  "include": ["src", "tests", "scripts"]
}
```

- [ ] **步骤 3：创建 `config.json`**

```json
{
  "port": 5173,
  "scanRoots": ["D:\\OneDrive\\Project Files"],
  "scanDepth": 2,
  "projects": [],
  "watch": { "debounceMs": 150, "rescanRootsMs": 60000 }
}
```

- [ ] **步骤 4：在 `.gitignore` 末尾追加**

```gitignore

# 配置原子写的临时文件
*.tmp
```

- [ ] **步骤 5：安装依赖**

> 若希望 `node_modules` 不进 OneDrive 同步，先按任务 24 README 中「OneDrive 注意事项」建 junction，再执行安装。

```bash
bun install
./node_modules/.bin/tsc -v
```

预期：安装 6 个直接依赖并生成 `bun.lock`；`tsc -v` 输出 `Version 7.0.2`。

- [ ] **步骤 6：Commit**

```bash
git add package.json tsconfig.json config.json .gitignore bun.lock
git commit -m "chore: 初始化 Bun + React + TypeScript 脚手架"
```

### 任务 2：共享类型与测试夹具

**文件：**
- 创建：`src/shared/types.ts`
- 创建：`tests/helpers/fixture.ts`

- [ ] **步骤 1：编写共享类型**

前后端共用的唯一类型来源。后续所有任务都从这里导入。

`src/shared/types.ts`：

```typescript
// 前后端共用类型（单一真相）。服务端产出、客户端消费，字段改动两端同时生效。

export const LIFECYCLES = ['implemented', 'proposed', 'rejected', 'archived'] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

export const CLASSES = ['architecture', 'feature', 'bug-fix', 'simplification', 'process', 'testing'] as const;

export function isLifecycle(value: string): value is Lifecycle {
  return (LIFECYCLES as readonly string[]).includes(value);
}

/** 链接三态。rawHref 是笔记原文中的 href（含 #anchor），前端据此把正文里的 <a> 对应回解析结果。 */
export type LinkResult =
  | { kind: 'resolved'; targetId: string; rawHref: string; anchor: string }
  | { kind: 'external'; rawHref: string; anchor: string }
  | { kind: 'unresolved'; rawHref: string; anchor: string };

export type Section = { heading: string; body: string };

export type NoteDoc = {
  id: string;
  slug: string;
  lifecycle: Lifecycle;
  cls: string;
  date: string;
  title: string;
  verdict: string;
  problem: string;
  decision: string;
  alternatives: string;
  consequences: string;
  extraSections: Section[];
  links: LinkResult[];
  /** 原文内容哈希，前端用来判断「正在阅读的笔记是否被改动」 */
  hash: string;
  rawBody: string;
};

export type NoteSummary = Omit<NoteDoc, 'rawBody'>;

export type ProjectSource = 'discovered' | 'manual';
export type WatchMode = 'live' | 'manual';
export type LifecycleCounts = Record<Lifecycle, number>;

export type ProjectMeta = {
  id: string;
  path: string;
  displayName: string;
  source: ProjectSource;
  hidden: boolean;
  healthy: boolean;
  watchMode: WatchMode;
  error: string | null;
  /** 发现顺序，前端用它从色板取色，保证颜色不随排序变化 */
  order: number;
  count: number;
  counts: LifecycleCounts;
  /** 左栏排序依据：最近真实文件事件时间，从未有事件时回落到笔记日期最大值 */
  lastChangeAt: number;
  scannedAt: number;
  scanMs: number;
};

export type ConfigResponse = {
  port: number;
  scanRoots: string[];
  scanDepth: number;
  configError: string | null;
  projects: ProjectMeta[];
};

export type NotesResponse = {
  project: ProjectMeta;
  notes: NoteSummary[];
  inCount: Record<string, number>;
};

export type NoteDetailResponse = { note: NoteDoc };

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

export type HubEventMap = {
  connected: ConnectedEvent;
  'project-updated': ProjectUpdatedEvent;
  'config-changed': ConfigChangedEvent;
  'project-error': ProjectErrorEvent;
};
export type HubEventName = keyof HubEventMap;
```

- [ ] **步骤 2：编写测试夹具**

在系统临时目录建项目，测试结束删除——**绝不碰真实笔记目录**。

`tests/helpers/fixture.ts`：

```typescript
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** 在系统临时目录建一个工作区，测试结束调用 cleanup 删除 */
export function makeTempDir(prefix = 'edm-'): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** 写入一组相对路径 → 内容的文件 */
export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

/** 在 root 下建一个含 .agents/notes 的项目，notes 的键是相对 notes 根的路径 */
export function makeProject(root: string, name: string, notes: Record<string, string>): string {
  const projectDir = join(root, name);
  mkdirSync(join(projectDir, '.agents', 'notes'), { recursive: true });
  writeFiles(join(projectDir, '.agents', 'notes'), notes);
  return projectDir;
}

export function note(title: string, status = 'implemented', body = '## Problem\n\np\n\n## Decision\n\nd\n'): string {
  return `# Agent Note: ${title}\n\nStatus: ${status}\n\n${body}`;
}
```

- [ ] **步骤 3：类型检查**

```bash
bun run typecheck
```

预期：无输出，退出码 0

- [ ] **步骤 4：Commit**

```bash
git add src/shared/types.ts tests/helpers/fixture.ts
git commit -m "feat: 前后端共享类型与测试夹具"
```

## 第一部分：服务端数据层

### 任务 3：笔记解析器

覆盖规格 §9.1 的全部解析器回归用例。关键点：先 `normalizeNewlines`（CRLF、BOM），再 `maskFences` 把围栏代码块替换为等长空白，结构识别只在遮罩文本上做、正文切片取原文。

**文件：**
- 创建：`src/server/parser.ts`
- 测试：`tests/server/parser.test.ts`

- [ ] **步骤 1：编写失败的测试**

`MULTI_PARAGRAPH_DECISION` 是真实笔记 `Pi/.agents/notes/implemented/architecture/2026-06-15-control-plane-via-runtime-settings.md` 的原文（复制进测试，不在运行时读取），其 Decision 为 459 字符。

`tests/server/parser.test.ts`：

`````typescript
import { describe, expect, test } from 'bun:test';
import { extractRawLinks, maskFences, normalizeNewlines, parseNote } from '../../src/server/parser';

const ID = 'implemented/architecture/2026-06-15-control-plane.md';

// 真实笔记 Pi/.agents/notes/implemented/architecture/2026-06-15-control-plane-via-runtime-settings.md 原文
const MULTI_PARAGRAPH_DECISION = `# Agent Note: 控制面经 runtime-settings.json + watchConfig，不走假 prompt 或斜杠命令

Status: implemented

## Problem

模式、审批、删段等控制操作需要从桌面传到扩展。01477049（2026-06-15）起扩展的运行时设置改为经 \`getConfig\` / \`getAllConfig\` 读取。

原因（用户说明）：控制面大多是 UI 层的功能，没必要再走斜杠命令。

## Decision

- 模式 / 审批 / 删段由桌面 IPC 带锁写 \`runtime-settings.json\`，扩展用 \`watchConfig\` 应用（\`docs/architecture.md\`「控制面约定」）。
- 斜杠菜单只保留发生式命令（\`/goal\`、\`/rules\`、工作流、技能、前端 \`/compact\`）；\`/plan-build\` 仍由计划卡片 \`runCommand\` 触发，但不出现在菜单。
- 每个会话（含子代理）各订一份 \`watchConfig\`，\`session_shutdown\` 时退订，见 [并行子代理冷启动开销](./2026-10-10-subagent-parallel-startup-cost.md)。

### 涉及文件

- \`electron-agent/electron/app/piRuntimeService.ts\`
- \`extensions/_shared/\`

### 来源

- 01477049
- \`docs/architecture.md\`「控制面约定」

## Alternatives considered

- **经假 prompt 或斜杠命令下发控制**：不采用：大多是 UI 层功能，没必要用斜杠命令（用户说明）。

## Consequences

- 新增控制项要走 runtime config 字段，不新增控制类斜杠命令。

## Verification

verify: n/a 回填的历史决定，源提交未记录验证
`;

describe('parseNote 章节抽取', () => {
  test('多段 Decision 完整抽取（> 400 字符，针对旧正则首个空行截断）', () => {
    const note = parseNote(MULTI_PARAGRAPH_DECISION, ID);
    expect(note.decision.length).toBeGreaterThan(400);
    expect(note.decision).toContain('session_shutdown');
  });

  test('Decision 内的 ### 子节包含在抽取结果内', () => {
    const note = parseNote(MULTI_PARAGRAPH_DECISION, ID);
    expect(note.decision).toContain('### 涉及文件');
    expect(note.decision).toContain('### 来源');
    expect(note.decision).not.toContain('## Alternatives');
  });

  test('末节正文含大写 Z 时正常抽取（针对 \\Z 锚点陷阱）', () => {
    const raw = `# Agent Note: t\n\nStatus: implemented\n\n## Problem\n\np\n\n## Alternatives considered\n\n- 用 Zustand 与 Zod 做状态，ZeroMQ 做总线。\n`;
    const note = parseNote(raw, ID);
    expect(note.alternatives).toBe('- 用 Zustand 与 Zod 做状态，ZeroMQ 做总线。');
  });

  test('末节无后续 ## 标题时抽取到字符串结尾', () => {
    const raw = `# Agent Note: t\n\nStatus: implemented\n\n## Consequences\n\n第一段\n\n第二段末尾`;
    expect(parseNote(raw, ID).consequences).toBe('第一段\n\n第二段末尾');
  });

  test('四段之外的 ## 章节按原顺序收进 extraSections', () => {
    const note = parseNote(MULTI_PARAGRAPH_DECISION, ID);
    expect(note.extraSections).toEqual([{ heading: 'Verification', body: 'verify: n/a 回填的历史决定，源提交未记录验证' }]);
  });

  test('Proposal 视同 Decision；重复的固定章节第二次出现进 extraSections', () => {
    const raw = `# Agent Note: t\n\nStatus: proposed\n\n## Proposal\n\n提案内容\n\n## Risks\n\nr\n\n## Proposal\n\n再来一次\n`;
    const note = parseNote(raw, 'proposed/feature/2026-10-12-x.md');
    expect(note.decision).toBe('提案内容');
    expect(note.extraSections.map((s) => s.heading)).toEqual(['Risks', 'Proposal']);
  });

  test('缺失的固定章节留空串', () => {
    const raw = `# Agent Note: t\n\nStatus: proposed\n\n## Problem\n\np\n`;
    const note = parseNote(raw, ID);
    expect(note.consequences).toBe('');
    expect(note.alternatives).toBe('');
  });

  test('CRLF 换行与 BOM 被归一化', () => {
    const raw = '\uFEFF# Agent Note: 标题\r\n\r\nStatus: implemented\r\n\r\n## Problem\r\n\r\n行一\r\n行二\r\n';
    const note = parseNote(raw, ID);
    expect(note.title).toBe('标题');
    expect(note.problem).toBe('行一\n行二');
    expect(note.rawBody).not.toContain('\r');
  });
});

describe('parseNote Status 行', () => {
  test('Status: rejected — 长原因 → lifecycle 与 verdict', () => {
    const raw = `# Agent Note: t\n\nStatus: rejected — 被 [新方案](../../implemented/architecture/2026-10-11-x.md) 取代：默认进程内运行。\n\n## Problem\n\np\n`;
    const note = parseNote(raw, 'rejected/architecture/2026-10-11-y.md');
    expect(note.lifecycle).toBe('rejected');
    expect(note.verdict).toBe('被 [新方案](../../implemented/architecture/2026-10-11-x.md) 取代：默认进程内运行。');
  });

  test('Status: implemented → verdict 为空串', () => {
    const note = parseNote(`# Agent Note: t\n\nStatus: implemented\n`, ID);
    expect(note.lifecycle).toBe('implemented');
    expect(note.verdict).toBe('');
  });

  test('缺 Status 行时用文件夹推断 lifecycle', () => {
    const note = parseNote(`# Agent Note: t\n\n## Problem\n\np\n`, 'proposed/feature/2026-10-01-x.md');
    expect(note.lifecycle).toBe('proposed');
  });

  test('Status 值非法时回落文件夹', () => {
    const note = parseNote(`# Agent Note: t\n\nStatus: wip\n`, 'archived/process/2026-10-01-x.md');
    expect(note.lifecycle).toBe('archived');
  });
});

describe('parseNote 元数据', () => {
  test('slug / cls / date 来自路径', () => {
    const note = parseNote('# Agent Note: t\n', ID);
    expect(note.slug).toBe('2026-06-15-control-plane');
    expect(note.cls).toBe('architecture');
    expect(note.date).toBe('2026-06-15');
  });

  test('slug 无日期前缀时 date 为空串', () => {
    expect(parseNote('# Agent Note: t\n', 'implemented/feature/no-date.md').date).toBe('');
  });

  test('缺 H1 时标题回落为 slug；普通 H1 也可作为标题', () => {
    expect(parseNote('Status: implemented\n', ID).title).toBe('2026-06-15-control-plane');
    expect(parseNote('# 普通标题\n', ID).title).toBe('普通标题');
  });

  test('hash 随内容变化', () => {
    expect(parseNote('# Agent Note: a\n', ID).hash).not.toBe(parseNote('# Agent Note: b\n', ID).hash);
  });
});

describe('围栏代码块', () => {
  const FENCED = `# Agent Note: t

Status: implemented

## Decision

正文

\`\`\`md
## 假标题
见 [假链接](./fake.md)
\`\`\`

结尾

## Consequences

c
`;

  test('围栏内的 ## 标题不被当作章节，但代码块保留在正文里', () => {
    const note = parseNote(FENCED, ID);
    expect(note.extraSections).toEqual([]);
    expect(note.decision).toContain('## 假标题');
    expect(note.decision).toContain('结尾');
    expect(note.consequences).toBe('c');
  });

  test('围栏内的 .md 链接不被收集', () => {
    expect(parseNote(FENCED, ID).rawLinks).toEqual([]);
  });

  test('maskFences 保持长度与换行位置', () => {
    const text = 'a\n```\nx\n```\nb';
    const masked = maskFences(text);
    expect(masked.length).toBe(text.length);
    expect(masked.split('\n').length).toBe(text.split('\n').length);
    expect(masked).toBe('a\n   \n \n   \nb');
  });

  test('~~~ 围栏与更长的 ``` 围栏也能识别', () => {
    expect(maskFences('~~~\n## x\n~~~\n## y')).toBe('   \n    \n   \n## y');
    expect(maskFences('````\n```\n## x\n````\n## y')).toBe('    \n   \n    \n    \n## y');
  });
});

describe('extractRawLinks', () => {
  test('只收 .md 链接，剥离 #anchor，跳过带协议的 URL', () => {
    const text = normalizeNewlines(
      '[a](./a.md) [b](../x/b.md#sec) [c](https://e.com/c.md) [d](./d.png) [e](mailto:x@y.md) [f](./f%20g.md)',
    );
    expect(extractRawLinks(text)).toEqual([
      { href: './a.md', path: './a.md', anchor: '' },
      { href: '../x/b.md#sec', path: '../x/b.md', anchor: 'sec' },
      { href: './f%20g.md', path: './f g.md', anchor: '' },
    ]);
  });
});
`````

- [ ] **步骤 2：运行测试确认失败**

```bash
bun test tests/server/parser.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/server/parser'`

- [ ] **步骤 3：编写实现**

`src/server/parser.ts`：

```typescript
import { isLifecycle, type Lifecycle, type NoteDoc, type Section } from '../shared/types';

/** 解析阶段产出的原始链接，等全项目 id 集合就绪后再由 links.ts 解析成三态 */
export type RawLink = { href: string; path: string; anchor: string };

export type ParsedNote = Omit<NoteDoc, 'links'> & { rawLinks: RawLink[] };

type FixedKey = 'problem' | 'decision' | 'alternatives' | 'consequences';

const SECTION_ALIASES: Record<FixedKey, readonly string[]> = {
  problem: ['problem', '问题'],
  decision: ['decision', 'proposal', '决策', '提案'],
  alternatives: ['alternatives considered', '曾考虑的替代方案', '曾考虑的备选'],
  consequences: ['consequences', '后果'],
};

const HEADING_RE = /^## +(.+?)[ \t]*$/gm;
const TITLE_RE = /^# Agent Note[^:：\n]*[:：][ \t]*(.+?)[ \t]*$/m;
const ANY_H1_RE = /^# +(.+?)[ \t]*$/m;
const STATUS_RE = /^Status:[ \t]*([a-z-]+)[ \t]*(?:[—–-][ \t]*(.*?))?[ \t]*$/m;
const LINK_RE = /\[[^\]\n]*\]\(([^)\s]+)(?:[ \t]+"[^"\n]*")?\)/g;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

export function normalizeNewlines(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/**
 * 把围栏代码块（含围栏行）的字符替换为空格、保留换行，偏移量与原文一一对应。
 * 结构识别（## 标题、Status 行、.md 链接）只在遮罩文本上做，正文切片仍取原文，代码块得以保留。
 */
export function maskFences(text: string): string {
  let fence: string | null = null;
  return text
    .split('\n')
    .map((line) => {
      if (fence === null) {
        const open = FENCE_OPEN_RE.exec(line);
        if (!open) return line;
        fence = open[1]!;
        return ' '.repeat(line.length);
      }
      const close = FENCE_CLOSE_RE.exec(line);
      if (close && close[1]![0] === fence[0] && close[1]!.length >= fence.length) fence = null;
      return ' '.repeat(line.length);
    })
    .join('\n');
}

/**
 * 按 `## ` 标题切分章节：每节正文止于下一个 `## ` 标题或字符串结尾。
 * 等价于设计文档 §4.2 的 `(?=^## |(?![\s\S]))` 语义，且不依赖 JS 不支持的 `\Z`，
 * 同时保留 `###` 子节（它们不匹配 `^## +`）。
 */
export function splitSections(text: string, masked: string): Section[] {
  const heads = [...masked.matchAll(HEADING_RE)].map((m) => ({
    heading: m[1]!.trim(),
    start: m.index!,
    bodyStart: m.index! + m[0].length,
  }));
  return heads.map((h, i) => ({
    heading: h.heading,
    body: text.slice(h.bodyStart, heads[i + 1]?.start ?? text.length).trim(),
  }));
}

function fixedKeyOf(heading: string): FixedKey | null {
  const lower = heading.toLowerCase();
  for (const key of Object.keys(SECTION_ALIASES) as FixedKey[]) {
    if (SECTION_ALIASES[key].includes(lower)) return key;
  }
  return null;
}

export function extractRawLinks(masked: string): RawLink[] {
  const links: RawLink[] = [];
  for (const m of masked.matchAll(LINK_RE)) {
    const href = m[1]!;
    if (SCHEME_RE.test(href)) continue;
    const hashAt = href.indexOf('#');
    const rawPath = hashAt === -1 ? href : href.slice(0, hashAt);
    const anchor = hashAt === -1 ? '' : href.slice(hashAt + 1);
    if (!/\.md$/i.test(rawPath)) continue;
    let path = rawPath;
    try {
      path = decodeURI(rawPath);
    } catch {
      // 非法百分号编码时按原样使用
    }
    links.push({ href, path, anchor });
  }
  return links;
}

/** 单篇笔记 → 结构化文档。id 为相对 notes 根、以 / 分隔的路径（.zh.md 已归一化为 .md）。 */
export function parseNote(raw: string, id: string): ParsedNote {
  const text = normalizeNewlines(raw);
  const masked = maskFences(text);
  const parts = id.split('/');
  const folderLifecycle = parts[0] as Lifecycle;
  const cls = parts[1] ?? '';
  const slug = (parts[parts.length - 1] ?? id).replace(/\.md$/i, '');
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(slug)?.[1] ?? '';

  const title = TITLE_RE.exec(masked)?.[1] ?? ANY_H1_RE.exec(masked)?.[1] ?? slug;

  const status = STATUS_RE.exec(masked);
  const statusWord = status?.[1] ?? '';
  const lifecycle: Lifecycle = isLifecycle(statusWord) ? statusWord : folderLifecycle;
  const verdict = status?.[2]?.trim() ?? '';

  const fixed: Record<FixedKey, string> = { problem: '', decision: '', alternatives: '', consequences: '' };
  const seen = new Set<FixedKey>();
  const extraSections: Section[] = [];
  for (const section of splitSections(text, masked)) {
    const key = fixedKeyOf(section.heading);
    if (key && !seen.has(key)) {
      seen.add(key);
      fixed[key] = section.body;
    } else {
      extraSections.push(section);
    }
  }

  return {
    id,
    slug,
    lifecycle,
    cls,
    date,
    title,
    verdict,
    ...fixed,
    extraSections,
    rawLinks: extractRawLinks(masked),
    hash: Bun.hash(text).toString(16),
    rawBody: text,
  };
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
bun test tests/server/parser.test.ts
```

预期：`21 pass`，`0 fail`

- [ ] **步骤 5：Commit**

```bash
git add tests/server/parser.test.ts src/server/parser.ts
git commit -m "feat: 笔记解析器（完整章节抽取、Status verdict、围栏遮罩）"
```

### 任务 4：链接三态解析

以笔记所在目录为基准归一化相对路径：越过 notes 根 → `external`；命中本项目 id → `resolved`；按路径没命中时按 slug 回退；仍找不到 → `unresolved`。不跨项目解析。

**文件：**
- 创建：`src/server/links.ts`
- 测试：`tests/server/links.test.ts`

- [ ] **步骤 1：编写失败的测试**

`tests/server/links.test.ts`：

```typescript
import { describe, expect, test } from 'bun:test';
import { buildLinkIndex, normalizeRelative, resolveLink, resolveLinks } from '../../src/server/links';
import type { RawLink } from '../../src/server/parser';

const FROM = 'rejected/architecture/2026-10-11-out-of-process.md';
const INDEX = buildLinkIndex([
  'implemented/architecture/2026-10-11-subagent-redesign.md',
  'rejected/feature/2026-10-12-approvals.md',
  'rejected/architecture/2026-10-10-job-guard.md',
  'implemented/feature/2026-09-01-moved.md',
  FROM,
]);

function link(href: string): RawLink {
  const [path, anchor = ''] = href.split('#') as [string, string?];
  return { href, path, anchor };
}

describe('resolveLink', () => {
  test('../../implemented/architecture/xxx.md → resolved', () => {
    expect(resolveLink(FROM, link('../../implemented/architecture/2026-10-11-subagent-redesign.md'), INDEX)).toEqual({
      kind: 'resolved',
      targetId: 'implemented/architecture/2026-10-11-subagent-redesign.md',
      rawHref: '../../implemented/architecture/2026-10-11-subagent-redesign.md',
      anchor: '',
    });
  });

  test('../feature/xxx.md（同生命周期跨分类）→ resolved', () => {
    const r = resolveLink(FROM, link('../feature/2026-10-12-approvals.md'), INDEX);
    expect(r.kind).toBe('resolved');
    expect(r.kind === 'resolved' && r.targetId).toBe('rejected/feature/2026-10-12-approvals.md');
  });

  test('同目录裸文件名 → resolved', () => {
    const r = resolveLink(FROM, link('2026-10-10-job-guard.md'), INDEX);
    expect(r.kind === 'resolved' && r.targetId).toBe('rejected/architecture/2026-10-10-job-guard.md');
  });

  test('../../../../docs/decisions/xxx.md → external', () => {
    expect(resolveLink(FROM, link('../../../../docs/decisions/x/2026-10-10-a.md'), INDEX).kind).toBe('external');
  });

  test('以 / 开头的仓库绝对路径 → external', () => {
    expect(resolveLink(FROM, link('/docs/architecture.md'), INDEX).kind).toBe('external');
  });

  test('./nonexistent.md → unresolved', () => {
    expect(resolveLink(FROM, link('./nonexistent.md'), INDEX)).toEqual({
      kind: 'unresolved',
      rawHref: './nonexistent.md',
      anchor: '',
    });
  });

  test('链接带 #anchor 后缀：anchor 被剥离，targetId 正确', () => {
    const r = resolveLink(FROM, link('../../implemented/architecture/2026-10-11-subagent-redesign.md#决策'), INDEX);
    expect(r).toEqual({
      kind: 'resolved',
      targetId: 'implemented/architecture/2026-10-11-subagent-redesign.md',
      rawHref: '../../implemented/architecture/2026-10-11-subagent-redesign.md#决策',
      anchor: '决策',
    });
  });

  test('路径未命中时按 slug 回退（笔记被挪了目录）', () => {
    const r = resolveLink(FROM, link('../../proposed/feature/2026-09-01-moved.md'), INDEX);
    expect(r.kind === 'resolved' && r.targetId).toBe('implemented/feature/2026-09-01-moved.md');
  });

  test('.zh.md 链接归一化为 .md', () => {
    const r = resolveLink(FROM, link('2026-10-10-job-guard.zh.md'), INDEX);
    expect(r.kind === 'resolved' && r.targetId).toBe('rejected/architecture/2026-10-10-job-guard.md');
  });
});

describe('resolveLinks', () => {
  test('按 rawHref 去重并丢弃自引用', () => {
    const out = resolveLinks(
      FROM,
      [link('./2026-10-10-job-guard.md'), link('./2026-10-10-job-guard.md'), link('./2026-10-11-out-of-process.md')],
      INDEX,
    );
    expect(out).toHaveLength(1);
  });
});

describe('normalizeRelative', () => {
  test('处理 ./ 与 ../', () => {
    expect(normalizeRelative(['a', 'b'], './c/../d.md')).toBe('a/b/d.md');
    expect(normalizeRelative(['a'], '../../x.md')).toBeNull();
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
bun test tests/server/links.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/server/links'`

- [ ] **步骤 3：编写实现**

`src/server/links.ts`：

```typescript
import type { LinkResult } from '../shared/types';
import type { RawLink } from './parser';

export type LinkIndex = { ids: ReadonlySet<string>; bySlug: ReadonlyMap<string, string> };

const ZH_MD_RE = /\.zh\.md$/i;

function slugOf(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}

/** ids 需按稳定顺序传入：slug 冲突时先到者胜出 */
export function buildLinkIndex(ids: readonly string[]): LinkIndex {
  const bySlug = new Map<string, string>();
  for (const id of ids) {
    const slug = slugOf(id);
    if (!bySlug.has(slug)) bySlug.set(slug, id);
  }
  return { ids: new Set(ids), bySlug };
}

/** 以 base 目录段为起点归一化相对路径；越过 notes 根（或以 / 开头）返回 null */
export function normalizeRelative(baseDir: readonly string[], rel: string): string | null {
  if (rel.startsWith('/')) return null;
  const out = [...baseDir];
  for (const seg of rel.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join('/');
}

export function resolveLink(fromId: string, link: RawLink, index: LinkIndex): LinkResult {
  const { href: rawHref, anchor } = link;
  const target = normalizeRelative(fromId.split('/').slice(0, -1), link.path);
  if (target === null) return { kind: 'external', rawHref, anchor };
  const id = target.replace(ZH_MD_RE, '.md');
  if (index.ids.has(id)) return { kind: 'resolved', targetId: id, rawHref, anchor };
  const bySlug = index.bySlug.get(slugOf(id));
  if (bySlug) return { kind: 'resolved', targetId: bySlug, rawHref, anchor };
  return { kind: 'unresolved', rawHref, anchor };
}

/** 解析一篇笔记的全部链接：按 rawHref 去重，丢弃指向自身的链接 */
export function resolveLinks(fromId: string, rawLinks: readonly RawLink[], index: LinkIndex): LinkResult[] {
  const seen = new Set<string>();
  const out: LinkResult[] = [];
  for (const link of rawLinks) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    const result = resolveLink(fromId, link, index);
    if (result.kind === 'resolved' && result.targetId === fromId) continue;
    out.push(result);
  }
  return out;
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
bun test tests/server/links.test.ts
```

预期：`11 pass`，`0 fail`

- [ ] **步骤 5：Commit**

```bash
git add tests/server/links.test.ts src/server/links.ts
git commit -m "feat: 链接三态解析（resolved / external / unresolved）"
```

### 任务 5：目录扫描

实现规格 §4.1 的发现规则。单篇读取失败只 `console.warn` 并跳过；notes 根不存在时抛错，由 Hub 标记项目失效。

**文件：**
- 创建：`src/server/scan.ts`
- 测试：`tests/server/scan.test.ts`

- [ ] **步骤 1：编写失败的测试**

`tests/server/scan.test.ts`：

```typescript
import { afterEach, describe, expect, test } from 'bun:test';
import { listNoteFiles, notesDir, scanNotes } from '../../src/server/scan';
import { makeProject, makeTempDir, note } from '../helpers/fixture';

let cleanup = () => {};
afterEach(() => cleanup());

function setup(notes: Record<string, string>): string {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  return notesDir(makeProject(tmp.dir, 'proj', notes));
}

describe('listNoteFiles', () => {
  test('只收三段以上、首段为生命周期的 .md，跳过 . 开头条目', async () => {
    const root = setup({
      'implemented/architecture/2026-01-01-a.md': note('a'),
      'implemented/architecture/deep/2026-01-02-b.md': note('b'),
      'implemented/README.md': 'two segments',
      'drafts/feature/2026-01-03-c.md': note('c'),
      'proposed/.gitkeep': '',
      'proposed/feature/.hidden.md': note('h'),
      '.trash/implemented/feature/x.md': note('x'),
      'implemented/feature/notes.txt': 'not md',
    });
    const ids = [...(await listNoteFiles(root)).keys()].sort();
    expect(ids).toEqual(['implemented/architecture/2026-01-01-a.md', 'implemented/architecture/deep/2026-01-02-b.md']);
  });

  test('.zh.md 归一化为 .md，同 id 时以 .zh.md 为准', async () => {
    const root = setup({
      'implemented/feature/2026-01-01-a.md': note('english'),
      'implemented/feature/2026-01-01-a.zh.md': note('中文'),
      'implemented/feature/2026-01-02-b.zh.md': note('仅中文'),
    });
    const files = await listNoteFiles(root);
    expect([...files.keys()].sort()).toEqual(['implemented/feature/2026-01-01-a.md', 'implemented/feature/2026-01-02-b.md']);
    expect(files.get('implemented/feature/2026-01-01-a.md')).toEndWith('2026-01-01-a.zh.md');
  });

  test('notes 根不存在时抛错', async () => {
    await expect(listNoteFiles('Z:/definitely/missing/notes')).rejects.toThrow();
  });
});

describe('scanNotes', () => {
  test('解析全部笔记、解析链接并按日期倒序', async () => {
    const root = setup({
      'implemented/architecture/2026-01-01-base.md': note('基础'),
      'implemented/feature/2026-02-01-child.md': note('子', 'implemented', '## Decision\n\n依赖 [基础](../architecture/2026-01-01-base.md)\n'),
      'proposed/feature/2026-03-01-p.md': note('提案', 'proposed', '## Proposal\n\n见 [外部](../../../../docs/x.md) 与 [断链](./missing.md)\n'),
    });
    const { notes, scanMs } = await scanNotes(root);
    expect(notes.map((n) => n.slug)).toEqual(['2026-03-01-p', '2026-02-01-child', '2026-01-01-base']);
    expect(notes[1]!.links).toEqual([
      { kind: 'resolved', targetId: 'implemented/architecture/2026-01-01-base.md', rawHref: '../architecture/2026-01-01-base.md', anchor: '' },
    ]);
    expect(notes[0]!.links.map((l) => l.kind)).toEqual(['external', 'unresolved']);
    expect(scanMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
bun test tests/server/scan.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/server/scan'`

- [ ] **步骤 3：编写实现**

`src/server/scan.ts`：

```typescript
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isLifecycle, type NoteDoc } from '../shared/types';
import { buildLinkIndex, resolveLinks } from './links';
import { parseNote, type ParsedNote } from './parser';

const ZH_MD_RE = /\.zh\.md$/i;

export function notesDir(projectPath: string): string {
  return join(projectPath, '.agents', 'notes');
}

/**
 * 遍历 notes 根，返回 id → 绝对路径。
 * 规则：跳过 . 开头条目；只收 .md；相对路径至少三段且首段是生命周期；
 * .zh.md 归一化为 .md，同 id 时 .zh.md 优先。根目录不存在时抛错（由调用方标记项目失效）。
 */
export async function listNoteFiles(root: string): Promise<Map<string, string>> {
  const found = new Map<string, { abs: string; zh: boolean }>();

  async function walk(dir: string, rel: string[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        try {
          await walk(abs, [...rel, entry.name]);
        } catch (err) {
          console.warn(`[scan] 无法读取目录 ${abs}: ${(err as Error).message}`);
        }
        continue;
      }
      if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;
      const zh = ZH_MD_RE.test(entry.name);
      const segs = [...rel, entry.name.replace(ZH_MD_RE, '.md')];
      if (segs.length < 3 || !isLifecycle(segs[0]!)) continue;
      const id = segs.join('/');
      if (!found.has(id) || zh) found.set(id, { abs, zh });
    }
  }

  await walk(root, []);
  return new Map([...found].map(([id, v]) => [id, v.abs]));
}

/** 日期倒序，同日期按 id 升序；无日期的排最后 */
export function compareNotes(a: NoteDoc, b: NoteDoc): number {
  return b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
}

/** 全量扫描一个 notes 根：读盘 → 解析 → 解析链接 → 排序 */
export async function scanNotes(root: string): Promise<{ notes: NoteDoc[]; scanMs: number }> {
  const started = performance.now();
  const files = await listNoteFiles(root);
  const parsed: ParsedNote[] = [];
  await Promise.all(
    [...files].map(async ([id, abs]) => {
      try {
        parsed.push(parseNote(await readFile(abs, 'utf8'), id));
      } catch (err) {
        console.warn(`[scan] 跳过 ${abs}: ${(err as Error).message}`);
      }
    }),
  );
  parsed.sort((a, b) => a.id.localeCompare(b.id));
  const index = buildLinkIndex(parsed.map((p) => p.id));
  const notes: NoteDoc[] = parsed.map(({ rawLinks, ...rest }) => ({
    ...rest,
    links: resolveLinks(rest.id, rawLinks, index),
  }));
  notes.sort(compareNotes);
  return { notes, scanMs: performance.now() - started };
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
bun test tests/server/scan.test.ts
```

预期：`4 pass`，`0 fail`

- [ ] **步骤 5：Commit**

```bash
git add tests/server/scan.test.ts src/server/scan.ts
git commit -m "feat: notes 目录扫描与批量解析"
```

### 任务 6：项目索引纯函数

所有函数返回新对象、不修改入参。`fileEventAt` 只在文件事件触发的扫描时更新，左栏「最近变动」排序据此不被定期重扫干扰（规格 §5.3）。

**文件：**
- 创建：`src/server/store.ts`
- 测试：`tests/server/store.test.ts`

- [ ] **步骤 1：编写失败的测试**

`tests/server/store.test.ts`：

```typescript
import { describe, expect, test } from 'bun:test';
import type { LinkResult, NoteDoc } from '../../src/shared/types';
import {
  applyScan,
  computeInCount,
  countLifecycles,
  createIndex,
  latestNoteDateMs,
  markUnhealthy,
  toMeta,
  toSummary,
} from '../../src/server/store';

function doc(id: string, links: LinkResult[] = [], date = '2026-01-01'): NoteDoc {
  return {
    id,
    slug: id.split('/').pop()!.replace(/\.md$/, ''),
    lifecycle: id.split('/')[0] as NoteDoc['lifecycle'],
    cls: id.split('/')[1]!,
    date,
    title: id,
    verdict: '',
    problem: '',
    decision: '',
    alternatives: '',
    consequences: '',
    extraSections: [],
    links,
    hash: '0',
    rawBody: 'raw',
  };
}

const to = (targetId: string): LinkResult => ({ kind: 'resolved', targetId, rawHref: targetId, anchor: '' });

const INIT = { id: 'P', key: 'p', path: '/p', displayName: 'P', source: 'discovered' as const, hidden: false, order: 0 };

describe('computeInCount', () => {
  test('同一来源对同一目标只计一次，外部与断链不计入', () => {
    const notes = [
      doc('implemented/a/x.md'),
      doc('implemented/a/y.md', [to('implemented/a/x.md'), to('implemented/a/x.md')]),
      doc('implemented/a/z.md', [
        to('implemented/a/x.md'),
        { kind: 'external', rawHref: '../../../d.md', anchor: '' },
        { kind: 'unresolved', rawHref: './m.md', anchor: '' },
      ]),
    ];
    expect(Object.fromEntries(computeInCount(notes))).toEqual({ 'implemented/a/x.md': 2 });
  });
});

describe('countLifecycles / latestNoteDateMs', () => {
  test('按生命周期计数且四个键齐全', () => {
    expect(countLifecycles([doc('implemented/a/x.md'), doc('rejected/a/y.md')])).toEqual({
      implemented: 1,
      proposed: 0,
      rejected: 1,
      archived: 0,
    });
  });

  test('取最大日期，无日期时为 0', () => {
    expect(latestNoteDateMs([doc('implemented/a/x.md', [], '2026-01-01'), doc('implemented/a/y.md', [], '2026-03-01')])).toBe(
      Date.parse('2026-03-01T00:00:00'),
    );
    expect(latestNoteDateMs([doc('implemented/a/x.md', [], '')])).toBe(0);
  });
});

describe('applyScan / toMeta', () => {
  test('只有 file 触发的扫描才更新 fileEventAt', () => {
    const base = createIndex(INIT);
    const initial = applyScan(base, [doc('implemented/a/x.md')], 3, 'initial', 1000);
    expect(initial.fileEventAt).toBe(0);
    const fromFile = applyScan(initial, [], 2, 'file', 2000);
    expect(fromFile.fileEventAt).toBe(2000);
    const manual = applyScan(fromFile, [], 2, 'manual', 3000);
    expect(manual.fileEventAt).toBe(2000);
    expect(manual.scannedAt).toBe(3000);
  });

  test('不修改入参索引', () => {
    const base = createIndex(INIT);
    applyScan(base, [doc('implemented/a/x.md')], 1, 'initial', 1);
    expect(base.notes).toHaveLength(0);
  });

  test('lastChangeAt 在无文件事件时回落到笔记最大日期', () => {
    const idx = applyScan(createIndex(INIT), [doc('implemented/a/x.md', [], '2026-02-02')], 1, 'initial', 99);
    expect(toMeta(idx).lastChangeAt).toBe(Date.parse('2026-02-02T00:00:00'));
    expect(toMeta(applyScan(idx, idx.notes, 1, 'file', 5e12)).lastChangeAt).toBe(5e12);
  });

  test('markUnhealthy 清空笔记并记录原因', () => {
    const idx = markUnhealthy(applyScan(createIndex(INIT), [doc('implemented/a/x.md')], 1, 'initial', 1), '路径失效');
    expect(toMeta(idx)).toMatchObject({ healthy: false, error: '路径失效', count: 0 });
  });
});

test('toSummary 去掉 rawBody', () => {
  expect('rawBody' in toSummary(doc('implemented/a/x.md'))).toBe(false);
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
bun test tests/server/store.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/server/store'`

- [ ] **步骤 3：编写实现**

`src/server/store.ts`：

```typescript
import {
  LIFECYCLES,
  type LifecycleCounts,
  type NoteDoc,
  type NoteSummary,
  type ProjectMeta,
  type ProjectSource,
  type WatchMode,
} from '../shared/types';

export type ProjectIndex = {
  id: string;
  /** 归一化路径键（Windows 下小写），用于和配置/发现结果对账 */
  key: string;
  path: string;
  displayName: string;
  source: ProjectSource;
  hidden: boolean;
  order: number;
  healthy: boolean;
  watchMode: WatchMode;
  error: string | null;
  notes: NoteDoc[];
  byId: Map<string, NoteDoc>;
  inCount: Map<string, number>;
  scannedAt: number;
  fileEventAt: number;
  scanMs: number;
};

export type ScanCause = 'initial' | 'file' | 'manual';

export type ProjectInit = Pick<ProjectIndex, 'id' | 'key' | 'path' | 'displayName' | 'source' | 'hidden' | 'order'>;

export function createIndex(init: ProjectInit): ProjectIndex {
  return {
    ...init,
    healthy: true,
    watchMode: 'live',
    error: null,
    notes: [],
    byId: new Map(),
    inCount: new Map(),
    scannedAt: 0,
    fileEventAt: 0,
    scanMs: 0,
  };
}

/** 被引用次数：每篇笔记对同一目标只计一次，只统计 resolved 链接 */
export function computeInCount(notes: readonly NoteDoc[]): Map<string, number> {
  const inCount = new Map<string, number>();
  for (const note of notes) {
    const targets = new Set<string>();
    for (const link of note.links) {
      if (link.kind === 'resolved' && link.targetId !== note.id) targets.add(link.targetId);
    }
    for (const target of targets) inCount.set(target, (inCount.get(target) ?? 0) + 1);
  }
  return inCount;
}

export function countLifecycles(notes: readonly NoteDoc[]): LifecycleCounts {
  const counts = Object.fromEntries(LIFECYCLES.map((l) => [l, 0])) as LifecycleCounts;
  for (const note of notes) counts[note.lifecycle] += 1;
  return counts;
}

/** 笔记 date 字段的最大值（毫秒），无日期时为 0 */
export function latestNoteDateMs(notes: readonly NoteDoc[]): number {
  let max = 0;
  for (const note of notes) {
    if (!note.date) continue;
    const ms = Date.parse(`${note.date}T00:00:00`);
    if (Number.isFinite(ms) && ms > max) max = ms;
  }
  return max;
}

/** 用一次扫描结果生成新索引（不修改入参） */
export function applyScan(
  index: ProjectIndex,
  notes: NoteDoc[],
  scanMs: number,
  cause: ScanCause,
  now: number,
): ProjectIndex {
  return {
    ...index,
    healthy: true,
    error: null,
    notes,
    byId: new Map(notes.map((n) => [n.id, n])),
    inCount: computeInCount(notes),
    scannedAt: now,
    fileEventAt: cause === 'file' ? now : index.fileEventAt,
    scanMs,
  };
}

export function markUnhealthy(index: ProjectIndex, reason: string): ProjectIndex {
  return { ...index, healthy: false, error: reason, notes: [], byId: new Map(), inCount: new Map() };
}

export function toMeta(index: ProjectIndex): ProjectMeta {
  return {
    id: index.id,
    path: index.path,
    displayName: index.displayName,
    source: index.source,
    hidden: index.hidden,
    healthy: index.healthy,
    watchMode: index.watchMode,
    error: index.error,
    order: index.order,
    count: index.notes.length,
    counts: countLifecycles(index.notes),
    lastChangeAt: index.fileEventAt || latestNoteDateMs(index.notes),
    scannedAt: index.scannedAt,
    scanMs: index.scanMs,
  };
}

export function toSummary(note: NoteDoc): NoteSummary {
  const { rawBody: _rawBody, ...summary } = note;
  return summary;
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
bun test tests/server/store.test.ts
```

预期：`8 pass`，`0 fail`

- [ ] **步骤 5：Commit**

```bash
git add tests/server/store.test.ts src/server/store.ts
git commit -m "feat: 项目索引、引用计数与元数据投影"
```

### 任务 7：配置读写

规格 §3：读-改-写 + 原子替换；文件损坏时用内置默认值并报错，**绝不覆盖用户文件**——`update()` 每次先重读磁盘，若此刻损坏则拒绝写入。并发 `update()` 串行执行。

**文件：**
- 创建：`src/server/config.ts`
- 测试：`tests/server/config.test.ts`

- [ ] **步骤 1：编写失败的测试**

`tests/server/config.test.ts`：

```typescript
import { afterEach, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConfigStore, defaultConfig, loadConfig, normalizeConfig, saveConfig } from '../../src/server/config';
import { makeTempDir } from '../helpers/fixture';

let cleanup = () => {};
afterEach(() => cleanup());

function tempConfigPath(): string {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  return join(tmp.dir, 'config.json');
}

describe('loadConfig', () => {
  test('文件不存在时返回默认值且无错误', async () => {
    const path = tempConfigPath();
    const { config, error } = await loadConfig(path);
    expect(error).toBeNull();
    expect(config).toEqual(defaultConfig(path));
    expect(config.scanRoots).toEqual([resolve(path, '..', '..')]);
  });

  test('JSON 损坏时返回默认值 + 错误，且不改动文件', async () => {
    const path = tempConfigPath();
    writeFileSync(path, '{ "port": 1,, }');
    const { config, error } = await loadConfig(path);
    expect(error).toContain('config.json 解析失败');
    expect(config.port).toBe(5173);
    expect(readFileSync(path, 'utf8')).toBe('{ "port": 1,, }');
  });

  test('合法文件按字段读取', async () => {
    const path = tempConfigPath();
    writeFileSync(path, JSON.stringify({ port: 6000, scanRoots: ['D:/x'], projects: [{ path: 'D:/y', name: ' Y ', hidden: true }] }));
    const { config } = await loadConfig(path);
    expect(config.port).toBe(6000);
    expect(config.scanRoots).toEqual(['D:/x']);
    expect(config.projects).toEqual([{ path: 'D:/y', name: 'Y', hidden: true }]);
    expect(config.watch).toEqual({ debounceMs: 150, rescanRootsMs: 60000 });
  });
});

describe('normalizeConfig', () => {
  const defaults = defaultConfig('/app/config.json');

  test('类型错误的字段回落默认值，非法项目条目被丢弃', () => {
    const config = normalizeConfig(
      { port: 'x', scanDepth: -1, projects: [{ path: '' }, { nope: 1 }, { path: 'D:/ok' }], watch: { debounceMs: 50 } },
      defaults,
    );
    expect(config.port).toBe(5173);
    expect(config.scanDepth).toBe(2);
    expect(config.projects).toEqual([{ path: 'D:/ok', name: null, hidden: false }]);
    expect(config.watch).toEqual({ debounceMs: 50, rescanRootsMs: 60000 });
  });

  test('顶层不是对象时抛错', () => {
    expect(() => normalizeConfig([], defaults)).toThrow();
  });
});

describe('saveConfig / ConfigStore.update', () => {
  test('原子写入后不残留临时文件', async () => {
    const path = tempConfigPath();
    await saveConfig(path, defaultConfig(path));
    expect(JSON.parse(readFileSync(path, 'utf8')).port).toBe(5173);
    expect(readdirSync(join(path, '..'))).toEqual(['config.json']);
  });

  test('update 先重读磁盘，保留用户手工编辑的字段', async () => {
    const path = tempConfigPath();
    const store = new ConfigStore(path);
    await store.load();
    writeFileSync(path, JSON.stringify({ port: 7000 }));
    const next = await store.update((c) => ({ ...c, projects: [...c.projects, { path: 'D:/n', name: null, hidden: false }] }));
    expect(next.port).toBe(7000);
    expect(JSON.parse(readFileSync(path, 'utf8')).projects).toHaveLength(1);
  });

  test('文件损坏时 update 拒绝写入', async () => {
    const path = tempConfigPath();
    writeFileSync(path, 'not json');
    const store = new ConfigStore(path);
    await store.load();
    expect(store.error).toContain('解析失败');
    await expect(store.update((c) => c)).rejects.toThrow('解析失败');
    expect(readFileSync(path, 'utf8')).toBe('not json');
  });

  test('并发 update 串行执行，不丢写', async () => {
    const path = tempConfigPath();
    const store = new ConfigStore(path);
    await store.load();
    await Promise.all(
      ['a', 'b', 'c'].map((p) => store.update((c) => ({ ...c, projects: [...c.projects, { path: p, name: null, hidden: false }] }))),
    );
    expect(JSON.parse(readFileSync(path, 'utf8')).projects.map((p: { path: string }) => p.path)).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
bun test tests/server/config.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/server/config'`

- [ ] **步骤 3：编写实现**

`src/server/config.ts`：

```typescript
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type ProjectEntry = { path: string; name: string | null; hidden: boolean };

export type Config = {
  port: number;
  scanRoots: string[];
  scanDepth: number;
  projects: ProjectEntry[];
  watch: { debounceMs: number; rescanRootsMs: number };
};

/** 内置默认值：扫描根默认为应用目录的上一级（即与本应用并列的各项目） */
export function defaultConfig(configPath: string): Config {
  return {
    port: 5173,
    scanRoots: [resolve(dirname(configPath), '..')],
    scanDepth: 2,
    projects: [],
    watch: { debounceMs: 150, rescanRootsMs: 60_000 },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizeEntry(value: unknown): ProjectEntry | null {
  if (!isRecord(value) || typeof value.path !== 'string' || !value.path.trim()) return null;
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : null;
  return { path: value.path, name, hidden: value.hidden === true };
}

/** 逐字段校验，类型不对的字段回落默认值；顶层不是对象时抛错 */
export function normalizeConfig(input: unknown, defaults: Config): Config {
  if (!isRecord(input)) throw new Error('config.json 顶层必须是对象');
  const watch = isRecord(input.watch) ? input.watch : {};
  return {
    port: positiveInt(input.port, defaults.port),
    scanRoots: Array.isArray(input.scanRoots)
      ? input.scanRoots.filter((r): r is string => typeof r === 'string' && r.trim() !== '')
      : defaults.scanRoots,
    scanDepth: positiveInt(input.scanDepth, defaults.scanDepth),
    projects: Array.isArray(input.projects)
      ? input.projects.map(normalizeEntry).filter((e): e is ProjectEntry => e !== null)
      : defaults.projects,
    watch: {
      debounceMs: positiveInt(watch.debounceMs, defaults.watch.debounceMs),
      rescanRootsMs: positiveInt(watch.rescanRootsMs, defaults.watch.rescanRootsMs),
    },
  };
}

export type LoadResult = { config: Config; error: string | null };

/** 读取配置。文件不存在 → 默认值；解析失败 → 默认值 + 错误信息（绝不覆盖用户文件） */
export async function loadConfig(path: string): Promise<LoadResult> {
  const defaults = defaultConfig(path);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { config: defaults, error: null };
    return { config: defaults, error: `读取 config.json 失败：${(err as Error).message}` };
  }
  try {
    return { config: normalizeConfig(JSON.parse(text), defaults), error: null };
  } catch (err) {
    return { config: defaults, error: `config.json 解析失败，已使用内置默认值：${(err as Error).message}` };
  }
}

/** 原子写：先写同目录临时文件，再 rename 覆盖 */
export async function saveConfig(path: string, config: Config): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}

export class ConfigStore {
  current: Config;
  error: string | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(readonly path: string) {
    this.current = defaultConfig(path);
  }

  async load(): Promise<Config> {
    const { config, error } = await loadConfig(this.path);
    this.current = config;
    this.error = error;
    if (error) console.error(`[config] ${error}`);
    return config;
  }

  /**
   * 读-改-写，串行执行。每次先重读磁盘以纳入用户手工编辑；
   * 若文件此刻已损坏则拒绝写入并抛错，保护用户文件。
   */
  update(mutate: (config: Config) => Config): Promise<Config> {
    const run = async (): Promise<Config> => {
      const { config, error } = await loadConfig(this.path);
      if (error) throw new Error(error);
      const next = mutate(config);
      await saveConfig(this.path, next);
      this.current = next;
      this.error = null;
      return next;
    };
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => undefined);
    return result;
  }
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
bun test tests/server/config.test.ts
```

预期：`9 pass`，`0 fail`

- [ ] **步骤 5：Commit**

```bash
git add tests/server/config.test.ts src/server/config.ts
git commit -m "feat: config.json 读取、校验与原子写"
```

### 任务 8：项目发现与合并

扫描根深度为 0，逐级 +1，深度 ≤ `scanDepth`；命中项目后不再深入。Windows 路径比较不区分大小写（`pathKey`）。id 取文件夹名，冲突追加 `-2`。

**文件：**
- 创建：`src/server/discovery.ts`
- 测试：`tests/server/discovery.test.ts`

- [ ] **步骤 1：编写失败的测试**

`tests/server/discovery.test.ts`：

```typescript
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { allocateId, discoverProjects, pathKey, resolveProjects } from '../../src/server/discovery';
import { makeProject, makeTempDir, note } from '../helpers/fixture';

let cleanup = () => {};
afterEach(() => cleanup());

describe('discoverProjects', () => {
  test('按深度找含 .agents/notes 的目录，跳过 . 开头与 node_modules，不深入已命中的项目', async () => {
    const tmp = makeTempDir();
    cleanup = tmp.cleanup;
    const n = { 'implemented/feature/2026-01-01-a.md': note('a') };
    makeProject(tmp.dir, 'A', n);
    makeProject(join(tmp.dir, 'group'), 'B', n);
    makeProject(join(tmp.dir, 'group', 'deeper'), 'C', n);
    makeProject(join(tmp.dir, '.hidden'), 'D', n);
    makeProject(join(tmp.dir, 'node_modules'), 'E', n);
    makeProject(join(tmp.dir, 'A'), 'nested', n);
    mkdirSync(join(tmp.dir, 'empty'));

    const found = (await discoverProjects([tmp.dir], 2)).map((p) => p.slice(tmp.dir.length + 1).replaceAll('\\', '/')).sort();
    expect(found).toEqual(['A', 'group/B']);
  });

  test('扫描根不存在时返回空数组', async () => {
    expect(await discoverProjects(['Z:/missing/root'], 2)).toEqual([]);
  });
});

describe('resolveProjects', () => {
  test('发现项与配置项按路径合并：source 看是否被发现，名称/隐藏取配置', () => {
    const specs = resolveProjects(
      ['D:/Root/Pi', 'D:/Root/gren-ssh'],
      [
        { path: 'd:/root/pi', name: '派', hidden: true },
        { path: 'E:/Other/manual-proj', name: null, hidden: false },
      ],
    );
    expect(specs.map((s) => [s.folderName, s.displayName, s.source, s.hidden])).toEqual([
      ['Pi', '派', 'discovered', true],
      ['gren-ssh', 'gren-ssh', 'discovered', false],
      ['manual-proj', 'manual-proj', 'manual', false],
    ]);
    expect(specs[0]!.path).toBe(resolve('D:/Root/Pi'));
    expect(specs[0]!.key).toBe(pathKey('D:/Root/Pi'));
  });
});

describe('allocateId', () => {
  test('冲突时追加序号，大小写不敏感', () => {
    expect(allocateId('Pi', new Set())).toBe('Pi');
    expect(allocateId('Pi', new Set(['pi', 'Pi-2']))).toBe('Pi-3');
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
bun test tests/server/discovery.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/server/discovery'`

- [ ] **步骤 3：编写实现**

`src/server/discovery.ts`：

```typescript
import { readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { ProjectSource } from '../shared/types';
import type { ProjectEntry } from './config';
import { notesDir } from './scan';

const SKIP_DIRS = new Set(['node_modules']);

/** 路径对账键：绝对化，Windows 下不区分大小写 */
export function pathKey(path: string): string {
  const abs = resolve(path);
  return process.platform === 'win32' ? abs.toLowerCase() : abs;
}

export async function hasNotesDir(dir: string): Promise<boolean> {
  try {
    return (await stat(notesDir(dir))).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 在扫描根下找含 .agents/notes 的目录。根本身深度为 0，子目录逐级 +1，深度 ≤ maxDepth。
 * 命中项目后不再深入其子目录；跳过 . 开头目录与 node_modules；读不了的目录静默跳过。
 */
export async function discoverProjects(roots: readonly string[], maxDepth: number): Promise<string[]> {
  const found = new Map<string, string>();

  async function visit(dir: string, depth: number): Promise<void> {
    if (await hasNotesDir(dir)) {
      found.set(pathKey(dir), dir);
      return;
    }
    if (depth >= maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      await visit(join(dir, entry.name), depth + 1);
    }
  }

  for (const root of roots) await visit(resolve(root), 0);
  return [...found.values()];
}

export type ProjectSpec = {
  key: string;
  path: string;
  folderName: string;
  displayName: string;
  source: ProjectSource;
  hidden: boolean;
};

/**
 * 合并「自动发现」与「config.projects」。
 * 同一路径两边都有时只保留一项：source 仍按是否被发现判定，名称/隐藏取配置条目（配置优先）。
 * 只出现在配置里的为 manual。
 */
export function resolveProjects(discovered: readonly string[], entries: readonly ProjectEntry[]): ProjectSpec[] {
  const specs = new Map<string, ProjectSpec>();
  const make = (path: string, source: ProjectSource, entry?: ProjectEntry): ProjectSpec => {
    const abs = resolve(path);
    const folderName = basename(abs) || abs;
    return {
      key: pathKey(abs),
      path: abs,
      folderName,
      displayName: entry?.name ?? folderName,
      source,
      hidden: entry?.hidden ?? false,
    };
  };
  for (const path of discovered) specs.set(pathKey(path), make(path, 'discovered'));
  for (const entry of entries) {
    const key = pathKey(entry.path);
    const prev = specs.get(key);
    specs.set(key, make(prev?.path ?? entry.path, prev?.source ?? 'manual', entry));
  }
  return [...specs.values()];
}

/** 以文件夹名为 id，冲突时追加 -2、-3…（大小写不敏感） */
export function allocateId(folderName: string, taken: ReadonlySet<string>): string {
  const lowerTaken = new Set([...taken].map((t) => t.toLowerCase()));
  let id = folderName;
  for (let n = 2; lowerTaken.has(id.toLowerCase()); n += 1) id = `${folderName}-${n}`;
  return id;
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
bun test tests/server/discovery.test.ts
```

预期：`4 pass`，`0 fail`

- [ ] **步骤 5：Commit**

```bash
git add tests/server/discovery.test.ts src/server/discovery.ts
git commit -m "feat: 扫描根发现项目并与配置合并"
```

### 任务 9：文件监听

目录不存在时 `fs.watch` 同步抛错，交给 Hub 降级为手动刷新。

**文件：**
- 创建：`src/server/watcher.ts`
- 测试：`tests/server/watcher.test.ts`

- [ ] **步骤 1：编写失败的测试**

`tests/server/watcher.test.ts`：

```typescript
import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { watchNotes, type WatchHandle } from '../../src/server/watcher';
import { makeTempDir } from '../helpers/fixture';

let cleanup = () => {};
let handle: WatchHandle | null = null;
afterEach(() => {
  handle?.close();
  handle = null;
  cleanup();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('连续写盘在 debounce 窗口内合并为一次回调，含新建子目录', async () => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  let calls = 0;
  handle = watchNotes(tmp.dir, { debounceMs: 150, onChange: () => (calls += 1), onError: () => {} });
  await sleep(100);

  mkdirSync(join(tmp.dir, 'implemented', 'feature'), { recursive: true });
  writeFileSync(join(tmp.dir, 'implemented', 'feature', 'a.md'), 'a');
  writeFileSync(join(tmp.dir, 'implemented', 'feature', 'a.md'), 'aa');
  writeFileSync(join(tmp.dir, 'implemented', 'feature', 'b.md'), 'b');

  await sleep(600);
  expect(calls).toBe(1);
});

test('close 之后不再回调', async () => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  let calls = 0;
  handle = watchNotes(tmp.dir, { debounceMs: 50, onChange: () => (calls += 1), onError: () => {} });
  await sleep(100);
  writeFileSync(join(tmp.dir, 'x.md'), 'x');
  handle.close();
  await sleep(300);
  expect(calls).toBe(0);
});

test('目录不存在时同步抛错', () => {
  expect(() => watchNotes('Z:/missing/notes', { debounceMs: 10, onChange: () => {}, onError: () => {} })).toThrow();
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
bun test tests/server/watcher.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/server/watcher'`

- [ ] **步骤 3：编写实现**

`src/server/watcher.ts`：

```typescript
import { watch } from 'node:fs';

export type WatchHandle = { close: () => void };

export type WatchOptions = {
  debounceMs: number;
  onChange: () => void;
  onError: (err: Error) => void;
};

/**
 * 递归监听目录，debounce 合并连续事件后回调一次 onChange。
 * 目录不存在等建立失败的情况同步抛错，由调用方降级为手动刷新。
 */
export function watchNotes(dir: string, opts: WatchOptions): WatchHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  const watcher = watch(dir, { recursive: true }, () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!closed) opts.onChange();
    }, opts.debounceMs);
  });
  watcher.on('error', (err: Error) => {
    if (!closed) opts.onError(err);
  });
  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      watcher.close();
    },
  };
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
bun test tests/server/watcher.test.ts
```

预期：`3 pass`，`0 fail`

- [ ] **步骤 5：Commit**

```bash
git add tests/server/watcher.test.ts src/server/watcher.ts
git commit -m "feat: 递归文件监听与 debounce"
```

### 任务 10：SSE 广播器

首帧 `connected`，每 15 s 一行 `: keepalive`，响应头 `Cache-Control: no-store`。

**文件：**
- 创建：`src/server/events.ts`
- 测试：`tests/server/events.test.ts`

- [ ] **步骤 1：编写失败的测试**

`tests/server/events.test.ts`：

```typescript
import { afterEach, expect, test } from 'bun:test';
import { Broadcaster, formatEvent } from '../../src/server/events';

let hub: Broadcaster | null = null;
afterEach(() => {
  hub?.close();
  hub = null;
});

const decoder = new TextDecoder();

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read();
  return decoder.decode(value);
}

test('formatEvent 输出标准 SSE 帧', () => {
  expect(formatEvent('project-error', { id: 'Pi', reason: 'x' })).toBe(
    'event: project-error\ndata: {"id":"Pi","reason":"x"}\n\n',
  );
});

test('connect 首帧为 connected，响应头禁止缓存', async () => {
  hub = new Broadcaster(60_000);
  const res = hub.connect();
  expect(res.headers.get('Content-Type')).toStartWith('text/event-stream');
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  const first = await readChunk(res.body!.getReader());
  expect(first).toStartWith('event: connected\ndata: {"clientId":"');
  expect(hub.size).toBe(1);
});

test('broadcast 推送给所有客户端', async () => {
  hub = new Broadcaster(60_000);
  const a = hub.connect().body!.getReader();
  const b = hub.connect().body!.getReader();
  await readChunk(a);
  await readChunk(b);
  hub.broadcast('project-error', { id: 'Pi', reason: '路径失效' });
  expect(await readChunk(a)).toContain('event: project-error');
  expect(await readChunk(b)).toContain('路径失效');
});

test('按间隔发送 keepalive 注释行', async () => {
  hub = new Broadcaster(30);
  const reader = hub.connect().body!.getReader();
  await readChunk(reader);
  expect(await readChunk(reader)).toBe(': keepalive\n\n');
});

test('客户端取消后从列表移除', async () => {
  hub = new Broadcaster(60_000);
  const reader = hub.connect().body!.getReader();
  await readChunk(reader);
  await reader.cancel();
  expect(hub.size).toBe(0);
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
bun test tests/server/events.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/server/events'`

- [ ] **步骤 3：编写实现**

`src/server/events.ts`：

```typescript
import type { HubEventMap, HubEventName } from '../shared/types';

const encoder = new TextEncoder();

export function formatEvent<K extends HubEventName>(event: K, data: HubEventMap[K]): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** SSE 广播器：维护客户端流，定时发注释行心跳防中间层断连 */
export class Broadcaster {
  private readonly clients = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
  private readonly heartbeat: ReturnType<typeof setInterval>;

  constructor(heartbeatMs = 15_000) {
    this.heartbeat = setInterval(() => this.send(': keepalive\n\n'), heartbeatMs);
  }

  get size(): number {
    return this.clients.size;
  }

  /** 建立一条 SSE 流，首帧发送 connected。调用方须先对该请求关闭空闲超时（server.timeout(req, 0)）。 */
  connect(): Response {
    const clientId = crypto.randomUUID();
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.clients.set(clientId, controller);
        controller.enqueue(encoder.encode(formatEvent('connected', { clientId })));
      },
      cancel: () => {
        this.clients.delete(clientId);
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      },
    });
  }

  broadcast<K extends HubEventName>(event: K, data: HubEventMap[K]): void {
    this.send(formatEvent(event, data));
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const controller of this.clients.values()) {
      try {
        controller.close();
      } catch {
        // 流已被客户端关闭
      }
    }
    this.clients.clear();
  }

  private send(chunk: string): void {
    const bytes = encoder.encode(chunk);
    for (const [id, controller] of this.clients) {
      try {
        controller.enqueue(bytes);
      } catch {
        this.clients.delete(id);
      }
    }
  }
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
bun test tests/server/events.test.ts
```

预期：`5 pass`，`0 fail`

- [ ] **步骤 5：Commit**

```bash
git add tests/server/events.test.ts src/server/events.ts
git commit -m "feat: SSE 广播与 keepalive 心跳"
```

## 第二部分：服务进程

### 任务 11：Hub、API 路由与服务组装

`Hub` 串起前面所有模块：启动时 发现 → 合并配置 → 建 watch → 全量扫描；文件事件 → 该项目排队重扫 → 广播 `project-updated`；扫描失败 → `healthy=false` + `project-error`；watch 失败 → `watchMode='manual'` + `project-error`，手动重扫时重试建 watch。`api.ts` 只做参数校验与错误映射（`HubError.status`）。

**文件：**
- 创建：`src/server/hub.ts`
- 创建：`src/server/api.ts`
- 创建：`src/server/app.ts`
- 创建：`tests/helpers/server.ts`
- 测试：`tests/server/api.test.ts`

- [ ] **步骤 1：编写测试服务夹具（临时目录 + 端口 0 + SSE 读取器）**

`tests/helpers/server.ts`：

```typescript
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from '../../src/server/app';
import { Hub } from '../../src/server/hub';
import { makeTempDir } from './fixture';

export type TestEnv = {
  root: string;
  appDir: string;
  configPath: string;
  hub: Hub;
  base: string;
  close: () => void;
};

/** 在临时目录起一套 Hub + API 服务（不挂前端），scanRoots 指向 root */
export async function startTestServer(
  setup: (root: string) => void,
  config: Record<string, unknown> = {},
): Promise<TestEnv> {
  const tmp = makeTempDir();
  const root = join(tmp.dir, 'root');
  const appDir = join(tmp.dir, 'app');
  mkdirSync(root, { recursive: true });
  mkdirSync(appDir, { recursive: true });
  setup(root);
  const configPath = join(appDir, 'config.json');
  writeFileSync(
    configPath,
    JSON.stringify({ scanRoots: [root], scanDepth: 2, projects: [], watch: { debounceMs: 50, rescanRootsMs: 0 }, ...config }),
  );
  const hub = new Hub({ configPath, heartbeatMs: 60_000 });
  await hub.start();
  const server = createServer({ hub, port: 0 });
  return {
    root,
    appDir,
    configPath,
    hub,
    base: `http://127.0.0.1:${server.port}`,
    close: () => {
      hub.stop();
      server.stop(true);
      tmp.cleanup();
    },
  };
}

/** 读 SSE 流直到出现满足条件的事件，超时抛错 */
export async function waitForEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  match: (event: string, data: unknown) => boolean,
  timeoutMs = 5000,
): Promise<{ event: string; data: unknown }> {
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<null>((r) => setTimeout(() => r(null), deadline - Date.now())),
    ]);
    if (!chunk || chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = /^event: (.+)$/m.exec(frame)?.[1];
      const data = /^data: (.+)$/m.exec(frame)?.[1];
      if (event && data) {
        const parsed = JSON.parse(data);
        if (match(event, parsed)) return { event, data: parsed };
      }
    }
  }
  throw new Error('等待 SSE 事件超时');
}
```

- [ ] **步骤 2：编写失败的测试**

`tests/server/api.test.ts`：

```typescript
import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigResponse, NoteDetailResponse, NotesResponse, ProjectMeta } from '../../src/shared/types';
import { isTrustedRequest } from '../../src/server/api';
import { makeProject, makeTempDir, note } from '../helpers/fixture';
import { startTestServer, type TestEnv } from '../helpers/server';

let env: TestEnv | null = null;
let extraCleanup = () => {};
afterEach(() => {
  env?.close();
  env = null;
  extraCleanup();
  extraCleanup = () => {};
});

const NOTES = {
  'implemented/architecture/2026-01-01-base.md': note('基础'),
  'implemented/feature/2026-02-01-child.md': note('子', 'implemented', '## Decision\n\n见 [基础](../architecture/2026-01-01-base.md)\n'),
  'rejected/feature/2026-03-01-no.md': note('否决', 'rejected — 不需要'),
};

async function start(): Promise<TestEnv> {
  env = await startTestServer((root) => {
    makeProject(root, 'Alpha', NOTES);
    makeProject(root, 'Beta', { 'proposed/process/2026-04-01-p.md': note('提案', 'proposed') });
  });
  return env;
}

const getJson = async <T>(url: string): Promise<T> => (await fetch(url)).json() as Promise<T>;

describe('GET 接口', () => {
  test('/api/config 返回发现的项目与元数据', async () => {
    const { base } = await start();
    const config = await getJson<ConfigResponse>(`${base}/api/config`);
    expect(config.configError).toBeNull();
    expect(config.projects.map((p) => p.id).sort()).toEqual(['Alpha', 'Beta']);
    const alpha = config.projects.find((p) => p.id === 'Alpha')!;
    expect(alpha).toMatchObject({ source: 'discovered', healthy: true, watchMode: 'live', count: 3 });
    expect(alpha.counts).toEqual({ implemented: 2, proposed: 0, rejected: 1, archived: 0 });
  });

  test('/api/projects/:id/notes 不含 rawBody，带 inCount', async () => {
    const { base } = await start();
    const res = await getJson<NotesResponse>(`${base}/api/projects/Alpha/notes`);
    expect(res.notes).toHaveLength(3);
    expect(res.notes.every((n) => !('rawBody' in n))).toBe(true);
    expect(res.inCount).toEqual({ 'implemented/architecture/2026-01-01-base.md': 1 });
  });

  test('/api/projects/:id/notes/:noteId 返回完整内容（noteId 需 URL 编码）', async () => {
    const { base } = await start();
    const id = encodeURIComponent('rejected/feature/2026-03-01-no.md');
    const { note: doc } = await getJson<NoteDetailResponse>(`${base}/api/projects/Alpha/notes/${id}`);
    expect(doc.rawBody).toContain('# Agent Note: 否决');
    expect(doc.verdict).toBe('不需要');
  });

  test('未知项目 / 笔记 / 接口返回 404 JSON', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/projects/Nope/notes`)).status).toBe(404);
    expect((await fetch(`${base}/api/projects/Alpha/notes/x.md`)).status).toBe(404);
    const res = await fetch(`${base}/api/unknown`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain('未知接口');
  });
});

describe('项目管理接口', () => {
  test('POST 添加手动项目 → 写 config.json → 出现在列表', async () => {
    const { base, configPath } = await start();
    const outside = makeTempDir();
    extraCleanup = outside.cleanup;
    const path = makeProject(outside.dir, 'Gamma', { 'implemented/testing/2026-05-01-t.md': note('t') });

    const res = await fetch(`${base}/api/projects`, { method: 'POST', body: JSON.stringify({ path }) });
    expect(res.status).toBe(201);
    const meta = (await res.json()) as ProjectMeta;
    expect(meta).toMatchObject({ id: 'Gamma', source: 'manual', count: 1 });
    expect(JSON.parse(readFileSync(configPath, 'utf8')).projects).toEqual([{ path, name: null, hidden: false }]);

    const again = await fetch(`${base}/api/projects`, { method: 'POST', body: JSON.stringify({ path }) });
    expect(again.status).toBe(409);
  });

  test('POST 校验：相对路径 / 无 .agents/notes / 非 JSON 都是 400', async () => {
    const { base, root } = await start();
    const post = (body: string) => fetch(`${base}/api/projects`, { method: 'POST', body });
    expect((await post(JSON.stringify({ path: 'relative/path' }))).status).toBe(400);
    expect((await post(JSON.stringify({ path: root }))).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
    expect((await post(JSON.stringify({}))).status).toBe(400);
  });

  test('DELETE 只能移除手动项目', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/projects/Alpha`, { method: 'DELETE' })).status).toBe(409);

    const outside = makeTempDir();
    extraCleanup = outside.cleanup;
    const path = makeProject(outside.dir, 'Gamma', {});
    await fetch(`${base}/api/projects`, { method: 'POST', body: JSON.stringify({ path }) });
    expect((await fetch(`${base}/api/projects/Gamma`, { method: 'DELETE' })).status).toBe(204);
    const config = await getJson<ConfigResponse>(`${base}/api/config`);
    expect(config.projects.map((p) => p.id)).not.toContain('Gamma');
  });

  test('PATCH 改显示名与隐藏标记，发现项目仍保持 discovered', async () => {
    const { base, configPath } = await start();
    const res = await fetch(`${base}/api/projects/Alpha`, { method: 'PATCH', body: JSON.stringify({ name: '甲', hidden: true }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'Alpha', displayName: '甲', hidden: true, source: 'discovered' });
    expect(JSON.parse(readFileSync(configPath, 'utf8')).projects[0]).toMatchObject({ name: '甲', hidden: true });

    const reset = await fetch(`${base}/api/projects/Alpha`, { method: 'PATCH', body: JSON.stringify({ name: null }) });
    expect(await reset.json()).toMatchObject({ displayName: 'Alpha', hidden: true });
  });

  test('PATCH 校验字段类型', async () => {
    const { base } = await start();
    const patch = (body: unknown) => fetch(`${base}/api/projects/Alpha`, { method: 'PATCH', body: JSON.stringify(body) });
    expect((await patch({ hidden: 'yes' })).status).toBe(400);
    expect((await patch({ name: 1 })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
  });

  test('POST rescan 返回最新元数据', async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/projects/Beta/rescan`, { method: 'POST' });
    expect(await res.json()).toMatchObject({ id: 'Beta', count: 1 });
  });

  test('config.json 损坏时写操作返回 409 且不覆盖文件', async () => {
    const { base, configPath } = await start();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(configPath, '{ broken');
    const res = await fetch(`${base}/api/projects/Alpha`, { method: 'PATCH', body: JSON.stringify({ hidden: true }) });
    expect(res.status).toBe(409);
    expect(readFileSync(configPath, 'utf8')).toBe('{ broken');
  });
});

describe('健康状态与来源校验', () => {
  test('手动项目路径失效时 healthy=false、watchMode=manual，不影响其他项目', async () => {
    env = await startTestServer(
      (root) => makeProject(root, 'Alpha', NOTES),
      { projects: [{ path: join('Z:', 'missing', 'Ghost'), name: null, hidden: false }] },
    );
    const config = await getJson<ConfigResponse>(`${env.base}/api/config`);
    const ghost = config.projects.find((p) => p.id === 'Ghost')!;
    expect(ghost).toMatchObject({ healthy: false, watchMode: 'manual', source: 'manual' });
    expect(ghost.error).toContain('路径失效');
    expect(config.projects.find((p) => p.id === 'Alpha')!.healthy).toBe(true);
  });

  test('isTrustedRequest 拒绝外部 Host 与跨源 Origin', () => {
    const req = (headers: Record<string, string>) => new Request('http://127.0.0.1:5173/api/config', { headers });
    expect(isTrustedRequest(req({ host: '127.0.0.1:5173' }))).toBe(true);
    expect(isTrustedRequest(req({ host: 'localhost:5173', origin: 'http://localhost:5173' }))).toBe(true);
    expect(isTrustedRequest(req({ host: 'evil.com:5173' }))).toBe(false);
    expect(isTrustedRequest(req({ host: '127.0.0.1:5173', origin: 'https://evil.com' }))).toBe(false);
  });
});
```

- [ ] **步骤 3：运行测试确认失败**

```bash
bun test tests/server/api.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/server/api'`

- [ ] **步骤 4：编写实现（1/3）**

`src/server/hub.ts`：

```typescript
import { isAbsolute, resolve } from 'node:path';
import type { ConfigResponse, NoteDetailResponse, NotesResponse, ProjectMeta } from '../shared/types';
import { ConfigStore, type Config } from './config';
import { allocateId, discoverProjects, hasNotesDir, pathKey, resolveProjects } from './discovery';
import { Broadcaster } from './events';
import { notesDir, scanNotes } from './scan';
import { applyScan, createIndex, markUnhealthy, toMeta, toSummary, type ProjectIndex, type ScanCause } from './store';
import { watchNotes, type WatchHandle } from './watcher';

/** 带 HTTP 状态码的业务错误，api.ts 据此返回对应响应 */
export class HubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type ProjectPatch = { name?: string | null; hidden?: boolean };

export type HubOptions = { configPath: string; heartbeatMs?: number };

/** 进程内唯一的状态中心：项目索引、文件监听、配置读写、事件广播 */
export class Hub {
  readonly config: ConfigStore;
  readonly events: Broadcaster;
  private readonly projects = new Map<string, ProjectIndex>();
  private readonly watchers = new Map<string, WatchHandle>();
  private readonly scanQueues = new Map<string, Promise<unknown>>();
  private syncChain: Promise<unknown> = Promise.resolve();
  private rootsTimer: ReturnType<typeof setInterval> | null = null;
  private nextOrder = 0;
  private stopped = false;

  constructor(opts: HubOptions) {
    this.config = new ConfigStore(opts.configPath);
    this.events = new Broadcaster(opts.heartbeatMs);
  }

  async start(): Promise<void> {
    await this.config.load();
    await this.syncProjects();
    const { rescanRootsMs } = this.config.current.watch;
    if (rescanRootsMs > 0) this.rootsTimer = setInterval(() => void this.refreshRoots(), rescanRootsMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.rootsTimer) clearInterval(this.rootsTimer);
    for (const handle of this.watchers.values()) handle.close();
    this.watchers.clear();
    this.events.close();
  }

  getProject(id: string): ProjectIndex | undefined {
    return this.projects.get(id);
  }

  listMeta(): ProjectMeta[] {
    return [...this.projects.values()].sort((a, b) => a.order - b.order).map(toMeta);
  }

  configResponse(): ConfigResponse {
    const { port, scanRoots, scanDepth } = this.config.current;
    return { port, scanRoots, scanDepth, configError: this.config.error, projects: this.listMeta() };
  }

  notesResponse(id: string): NotesResponse {
    const index = this.requireProject(id);
    return {
      project: toMeta(index),
      notes: index.notes.map(toSummary),
      inCount: Object.fromEntries(index.inCount),
    };
  }

  noteDetail(id: string, noteId: string): NoteDetailResponse {
    const note = this.requireProject(id).byId.get(noteId);
    if (!note) throw new HubError(404, `未知笔记：${noteId}`);
    return { note };
  }

  /** 定期重扫扫描根：只看目录结构，项目集合有变化才广播 */
  async refreshRoots(): Promise<void> {
    try {
      if (await this.syncProjects()) this.broadcastConfig();
    } catch (err) {
      console.error(`[hub] 重扫扫描根失败：${(err as Error).message}`);
    }
  }

  /** 发现 + 配置 → 对账内存索引（串行执行）。返回项目集合或元数据是否变化 */
  syncProjects(): Promise<boolean> {
    const run = () => this.syncNow();
    const result = this.syncChain.then(run, run);
    this.syncChain = result.catch(() => undefined);
    return result;
  }

  rescan(id: string, cause: ScanCause): Promise<ProjectIndex | undefined> {
    const run = () => this.scanNow(id, cause);
    const result = (this.scanQueues.get(id) ?? Promise.resolve()).then(run, run);
    this.scanQueues.set(id, result.catch(() => undefined));
    return result;
  }

  async manualRescan(id: string): Promise<ProjectMeta> {
    this.requireProject(id);
    const next = await this.rescan(id, 'manual');
    if (!next) throw new HubError(404, `未知项目：${id}`);
    return toMeta(next);
  }

  async addProject(rawPath: string): Promise<ProjectMeta> {
    const path = rawPath.trim();
    if (!path || !isAbsolute(path)) throw new HubError(400, '请填写项目的绝对路径');
    if (!(await hasNotesDir(path))) throw new HubError(400, `该目录下没有 .agents/notes：${path}`);
    const key = pathKey(path);
    if (this.findByKey(key)) throw new HubError(409, '该项目已在列表中');
    await this.updateConfig((c) => ({ ...c, projects: [...c.projects, { path: resolve(path), name: null, hidden: false }] }));
    await this.syncProjects();
    this.broadcastConfig();
    const added = this.findByKey(key);
    if (!added) throw new HubError(500, '添加后未能载入项目');
    return toMeta(added);
  }

  async removeProject(id: string): Promise<void> {
    const index = this.requireProject(id);
    if (index.source !== 'manual') throw new HubError(409, '自动发现的项目不能移除，可以隐藏');
    await this.updateConfig((c) => ({ ...c, projects: c.projects.filter((e) => pathKey(e.path) !== index.key) }));
    await this.syncProjects();
    this.broadcastConfig();
  }

  async patchProject(id: string, patch: ProjectPatch): Promise<ProjectMeta> {
    const index = this.requireProject(id);
    await this.updateConfig((c) => {
      const existing = c.projects.find((e) => pathKey(e.path) === index.key);
      const base = existing ?? { path: index.path, name: null, hidden: false };
      const next = {
        ...base,
        ...(patch.name !== undefined ? { name: patch.name?.trim() || null } : {}),
        ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
      };
      const projects = existing
        ? c.projects.map((e) => (e === existing ? next : e))
        : [...c.projects, next];
      return { ...c, projects };
    });
    await this.syncProjects();
    this.broadcastConfig();
    return toMeta(this.requireProject(id));
  }

  private async syncNow(): Promise<boolean> {
    const { scanRoots, scanDepth, projects: entries } = this.config.current;
    const specs = resolveProjects(await discoverProjects(scanRoots, scanDepth), entries);
    const remaining = new Map([...this.projects.values()].map((p) => [p.key, p]));
    const added: string[] = [];
    let changed = false;

    for (const spec of specs) {
      const existing = remaining.get(spec.key);
      if (existing) {
        remaining.delete(spec.key);
        const { displayName, hidden, source } = spec;
        if (existing.displayName !== displayName || existing.hidden !== hidden || existing.source !== source) {
          this.projects.set(existing.id, { ...existing, displayName, hidden, source });
          changed = true;
        }
        continue;
      }
      const id = allocateId(spec.folderName, new Set(this.projects.keys()));
      this.projects.set(
        id,
        createIndex({
          id,
          key: spec.key,
          path: spec.path,
          displayName: spec.displayName,
          source: spec.source,
          hidden: spec.hidden,
          order: this.nextOrder++,
        }),
      );
      added.push(id);
      changed = true;
    }

    for (const gone of remaining.values()) {
      this.dropProject(gone.id);
      changed = true;
    }

    await Promise.all(
      added.map((id) => {
        this.startWatch(id);
        return this.rescan(id, 'initial');
      }),
    );
    return changed;
  }

  private async scanNow(id: string, cause: ScanCause): Promise<ProjectIndex | undefined> {
    if (this.stopped || !this.projects.has(id)) return this.projects.get(id);
    if (cause === 'manual' && this.projects.get(id)!.watchMode === 'manual') this.startWatch(id);
    const path = this.projects.get(id)!.path;
    try {
      const { notes, scanMs } = await scanNotes(notesDir(path));
      const current = this.projects.get(id);
      if (!current) return undefined;
      const next = applyScan(current, notes, scanMs, cause, Date.now());
      this.projects.set(id, next);
      this.events.broadcast('project-updated', {
        id,
        count: notes.length,
        delta: notes.length - current.notes.length,
        scanMs,
        at: next.scannedAt,
        project: toMeta(next),
      });
      return next;
    } catch (err) {
      const current = this.projects.get(id);
      if (!current) return undefined;
      const reason = `路径失效：${(err as Error).message}`;
      const next = markUnhealthy(current, reason);
      this.projects.set(id, next);
      this.events.broadcast('project-error', { id, reason });
      return next;
    }
  }

  private startWatch(id: string): void {
    const index = this.projects.get(id);
    if (!index) return;
    this.watchers.get(id)?.close();
    this.watchers.delete(id);
    try {
      const handle = watchNotes(notesDir(index.path), {
        debounceMs: this.config.current.watch.debounceMs,
        onChange: () => void this.rescan(id, 'file'),
        onError: (err) => this.degrade(id, err),
      });
      this.watchers.set(id, handle);
      this.projects.set(id, { ...index, watchMode: 'live' });
    } catch (err) {
      this.degrade(id, err as Error);
    }
  }

  private degrade(id: string, err: Error): void {
    this.watchers.get(id)?.close();
    this.watchers.delete(id);
    const index = this.projects.get(id);
    if (!index) return;
    this.projects.set(id, { ...index, watchMode: 'manual' });
    this.events.broadcast('project-error', { id, reason: `实时监听不可用，已切换为手动刷新：${err.message}` });
  }

  private dropProject(id: string): void {
    this.watchers.get(id)?.close();
    this.watchers.delete(id);
    this.scanQueues.delete(id);
    this.projects.delete(id);
  }

  private findByKey(key: string): ProjectIndex | undefined {
    return [...this.projects.values()].find((p) => p.key === key);
  }

  private requireProject(id: string): ProjectIndex {
    const index = this.projects.get(id);
    if (!index) throw new HubError(404, `未知项目：${id}`);
    return index;
  }

  private async updateConfig(mutate: (config: Config) => Config): Promise<void> {
    try {
      await this.config.update(mutate);
    } catch (err) {
      throw new HubError(409, (err as Error).message);
    }
  }

  private broadcastConfig(): void {
    this.events.broadcast('config-changed', { projects: this.listMeta() });
  }
}
```

- [ ] **步骤 5：编写实现（2/3）**

`src/server/api.ts`：

```typescript
import type { BunRequest, Server } from 'bun';
import { HubError, type Hub, type ProjectPatch } from './hub';

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** 只接受本机 Host（防 DNS 重绑定）且 Origin 缺省或同源（防跨站写配置） */
export function isTrustedRequest(req: Request): boolean {
  const host = req.headers.get('host')?.toLowerCase();
  if (!host) return false;
  if (!LOCAL_HOSTNAMES.has(host.replace(/:\d+$/, ''))) return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

type Handler<P extends string> = (req: BunRequest<P>, server: Server<undefined>) => Response | Promise<Response>;

function guard<P extends string>(handler: Handler<P>): Handler<P> {
  return async (req, server) => {
    if (!isTrustedRequest(req)) return json({ error: '仅接受本机同源请求' }, 403);
    try {
      return await handler(req, server);
    } catch (err) {
      if (err instanceof HubError) return json({ error: err.message }, err.status);
      console.error('[api]', err);
      return json({ error: '服务器内部错误' }, 500);
    }
  };
}

async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HubError(400, '请求体必须是 JSON');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HubError(400, '请求体必须是 JSON 对象');
  return body as Record<string, unknown>;
}

export function parsePatch(body: Record<string, unknown>): ProjectPatch {
  const patch: ProjectPatch = {};
  if ('name' in body) {
    if (body.name !== null && typeof body.name !== 'string') throw new HubError(400, 'name 必须是字符串或 null');
    patch.name = body.name;
  }
  if ('hidden' in body) {
    if (typeof body.hidden !== 'boolean') throw new HubError(400, 'hidden 必须是布尔值');
    patch.hidden = body.hidden;
  }
  if (patch.name === undefined && patch.hidden === undefined) throw new HubError(400, '没有可更新的字段');
  return patch;
}

export function createApiRoutes(hub: Hub) {
  return {
    '/api/config': {
      GET: guard<'/api/config'>(() => json(hub.configResponse())),
    },
    '/api/projects': {
      POST: guard<'/api/projects'>(async (req) => {
        const body = await readJsonObject(req);
        if (typeof body.path !== 'string') throw new HubError(400, '缺少 path');
        return json(await hub.addProject(body.path), 201);
      }),
    },
    '/api/projects/:id': {
      PATCH: guard<'/api/projects/:id'>(async (req) =>
        json(await hub.patchProject(req.params.id, parsePatch(await readJsonObject(req)))),
      ),
      DELETE: guard<'/api/projects/:id'>(async (req) => {
        await hub.removeProject(req.params.id);
        return new Response(null, { status: 204 });
      }),
    },
    '/api/projects/:id/rescan': {
      POST: guard<'/api/projects/:id/rescan'>(async (req) => json(await hub.manualRescan(req.params.id))),
    },
    '/api/projects/:id/notes': {
      GET: guard<'/api/projects/:id/notes'>((req) => json(hub.notesResponse(req.params.id))),
    },
    '/api/projects/:id/notes/:noteId': {
      GET: guard<'/api/projects/:id/notes/:noteId'>((req) => json(hub.noteDetail(req.params.id, req.params.noteId))),
    },
    '/api/events': {
      GET: guard<'/api/events'>((req, server) => {
        server.timeout(req, 0);
        return hub.events.connect();
      }),
    },
  };
}
```

- [ ] **步骤 6：编写实现（3/3）**

`src/server/app.ts`：

```typescript
import type { HTMLBundle } from 'bun';
import { createApiRoutes, json } from './api';
import type { Hub } from './hub';

export type ServerOptions = {
  hub: Hub;
  port: number;
  /** 前端入口；测试时省略，只起 API */
  index?: HTMLBundle;
  development?: boolean;
};

/** 组装 Bun.serve：API + SSE + 前端，只绑定 127.0.0.1 */
export function createServer(opts: ServerOptions) {
  return Bun.serve({
    hostname: '127.0.0.1',
    port: opts.port,
    development: opts.development ? { hmr: true, console: true } : false,
    routes: {
      ...createApiRoutes(opts.hub),
      '/': opts.index ?? new Response('前端未挂载（仅 API 模式）', { status: 404 }),
    },
    fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname.startsWith('/api/')) return json({ error: `未知接口：${pathname}` }, 404);
      return new Response('Not Found', { status: 404 });
    },
  });
}
```

- [ ] **步骤 7：运行测试确认通过**

```bash
bun test tests/server/api.test.ts
```

预期：`13 pass`，`0 fail`

- [ ] **步骤 8：Commit**

```bash
git add tests/server/api.test.ts src/server/hub.ts src/server/api.ts src/server/app.ts tests/helpers/server.ts
git commit -m "feat: Hub 状态中心、REST API 与服务组装"
```

### 任务 12：端到端实时同步测试

验证规格 §7 的完整链路：写盘 → watch → debounce → 重扫 → SSE → 条数变化。实现已在任务 11 完成，本任务是补齐端到端证据，测试应直接通过；若失败说明链路有缺口，回到任务 9–11 排查，**不要放宽断言**。

**文件：**
- 测试：`tests/e2e/live-sync.test.ts`

- [ ] **步骤 1：编写端到端测试**

`tests/e2e/live-sync.test.ts`：

```typescript
import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigResponse, NotesResponse, ProjectUpdatedEvent } from '../../src/shared/types';
import { makeProject, note } from '../helpers/fixture';
import { startTestServer, waitForEvent, type TestEnv } from '../helpers/server';

let env: TestEnv | null = null;
afterEach(() => {
  env?.close();
  env = null;
});

async function openEvents(base: string): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const res = await fetch(`${base}/api/events`);
  expect(res.headers.get('content-type')).toStartWith('text/event-stream');
  const reader = res.body!.getReader();
  await waitForEvent(reader, (event) => event === 'connected');
  return reader;
}

test('写入笔记 → SSE 收到 project-updated → 条数变化；删除后再次减少', async () => {
  env = await startTestServer((root) => makeProject(root, 'Live', { 'implemented/feature/2026-01-01-a.md': note('a') }));
  const notesRoot = join(env.root, 'Live', '.agents', 'notes');
  const reader = await openEvents(env.base);

  mkdirSync(join(notesRoot, 'proposed', 'architecture'), { recursive: true });
  writeFileSync(join(notesRoot, 'proposed', 'architecture', '2026-10-12-new.md'), note('新提案', 'proposed'));

  const added = await waitForEvent(reader, (event, data) => event === 'project-updated' && (data as ProjectUpdatedEvent).count === 2);
  expect((added.data as ProjectUpdatedEvent).delta).toBe(1);
  expect((added.data as ProjectUpdatedEvent).project.counts.proposed).toBe(1);

  const list = (await (await fetch(`${env.base}/api/projects/Live/notes`)).json()) as NotesResponse;
  expect(list.notes.map((n) => n.slug)).toContain('2026-10-12-new');

  rmSync(join(notesRoot, 'proposed', 'architecture', '2026-10-12-new.md'));
  const removed = await waitForEvent(reader, (event, data) => event === 'project-updated' && (data as ProjectUpdatedEvent).count === 1);
  expect((removed.data as ProjectUpdatedEvent).delta).toBe(-1);
  await reader.cancel();
});

test('文件事件触发的扫描更新 lastChangeAt', async () => {
  env = await startTestServer((root) => makeProject(root, 'Live', { 'implemented/feature/2026-01-01-a.md': note('a') }));
  const reader = await openEvents(env.base);
  const before = Date.now();
  writeFileSync(join(env.root, 'Live', '.agents', 'notes', 'implemented', 'feature', '2026-01-01-a.md'), note('a 改'));
  const { data } = await waitForEvent(reader, (event) => event === 'project-updated');
  expect((data as ProjectUpdatedEvent).project.lastChangeAt).toBeGreaterThanOrEqual(before);
  await reader.cancel();
});

test('定期重扫扫描根发现新项目并广播 config-changed', async () => {
  env = await startTestServer((root) => makeProject(root, 'First', {}));
  const reader = await openEvents(env.base);
  makeProject(env.root, 'Second', { 'implemented/feature/2026-01-01-b.md': note('b') });
  await env.hub.refreshRoots();
  const { data } = await waitForEvent(reader, (event) => event === 'config-changed');
  expect((data as { projects: { id: string }[] }).projects.map((p) => p.id).sort()).toEqual(['First', 'Second']);
  const config = (await (await fetch(`${env.base}/api/config`)).json()) as ConfigResponse;
  expect(config.projects.find((p) => p.id === 'Second')!.count).toBe(1);
  await reader.cancel();
});
```

- [ ] **步骤 2：运行测试（连续 3 次，确认不抖动）**

```bash
for i in 1 2 3; do bun test tests/e2e/live-sync.test.ts; done
```

预期：每次都是 `3 pass`，`0 fail`

- [ ] **步骤 3：Commit**

```bash
git add tests/e2e/live-sync.test.ts
git commit -m "test: 写盘到 SSE 的端到端实时同步"
```

### 任务 13：OneDrive 同步检测

规格 §8.1：只提示，不修改任何 OneDrive 设置。`node_modules` 若是指向外部的 junction 视为已处理。

**文件：**
- 创建：`src/server/onedrive.ts`
- 测试：`tests/server/onedrive.test.ts`

- [ ] **步骤 1：编写失败的测试**

`tests/server/onedrive.test.ts`：

```typescript
import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { checkNodeModulesSync } from '../../src/server/onedrive';
import { makeTempDir } from '../helpers/fixture';

let cleanup = () => {};
afterEach(() => cleanup());

function setup(): { oneDrive: string; app: string; outside: string } {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  const oneDrive = join(tmp.dir, 'OneDrive');
  const app = join(oneDrive, 'Projects', 'edm');
  const outside = join(tmp.dir, 'outside-node_modules');
  mkdirSync(app, { recursive: true });
  mkdirSync(outside);
  return { oneDrive, app, outside };
}

test('应用在 OneDrive 内且 node_modules 是实体目录时给出提示', async () => {
  const { oneDrive, app } = setup();
  mkdirSync(join(app, 'node_modules'));
  expect(await checkNodeModulesSync(app, { OneDrive: oneDrive })).toContain('README「OneDrive 注意事项」');
});

test('node_modules 是 junction 时不提示', async () => {
  const { oneDrive, app, outside } = setup();
  symlinkSync(outside, join(app, 'node_modules'), 'junction');
  expect(await checkNodeModulesSync(app, { OneDrive: oneDrive })).toBeNull();
});

test('应用不在 OneDrive 内或尚未安装依赖时不提示', async () => {
  const { app, outside } = setup();
  mkdirSync(join(app, 'node_modules'));
  expect(await checkNodeModulesSync(app, { OneDrive: outside })).toBeNull();
  expect(await checkNodeModulesSync(app, {})).toBeNull();
  const fresh = setup();
  expect(await checkNodeModulesSync(fresh.app, { OneDrive: fresh.oneDrive })).toBeNull();
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
bun test tests/server/onedrive.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/server/onedrive'`

- [ ] **步骤 3：编写实现**

`src/server/onedrive.ts`：

```typescript
import { lstat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathKey } from './discovery';

type Env = Record<string, string | undefined>;

export function oneDriveRoots(env: Env): string[] {
  return [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial].filter((v): v is string => !!v);
}

/**
 * 应用目录在 OneDrive 同步范围内、且 node_modules 是实体目录（不是指向外部的 junction/符号链接）时返回提示文案。
 * 只提示，不修改任何 OneDrive 配置。
 */
export async function checkNodeModulesSync(appDir: string, env: Env = process.env): Promise<string | null> {
  const app = pathKey(appDir);
  const inside = oneDriveRoots(env).some((root) => {
    const r = pathKey(root);
    return app === r || app.startsWith(r + sep);
  });
  if (!inside) return null;
  const nodeModules = join(appDir, 'node_modules');
  try {
    if ((await lstat(nodeModules)).isSymbolicLink()) return null;
  } catch {
    return null;
  }
  return `node_modules 位于 OneDrive 同步目录内（${nodeModules}），安装依赖会产生大量同步流量。处理方法见 README「OneDrive 注意事项」。`;
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
bun test tests/server/onedrive.test.ts
```

预期：`3 pass`，`0 fail`

- [ ] **步骤 5：Commit**

```bash
git add tests/server/onedrive.test.ts src/server/onedrive.ts
git commit -m "feat: 检测 node_modules 是否处于 OneDrive 同步范围"
```

### 任务 14：服务入口与真实数据集成测试

**文件：**
- 创建：`src/server/main.ts`
- 测试：`tests/integration/real-notes.test.ts`

- [ ] **步骤 1：编写真实数据集成测试**

只读扫描本机三个项目，断言结构性条件（数据在实时变动，不断言条数）。目录不存在时整组跳过；可用 `EDM_REAL_ROOT` 指定其他根目录。

`tests/integration/real-notes.test.ts`：

```typescript
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LIFECYCLES } from '../../src/shared/types';
import { notesDir, scanNotes } from '../../src/server/scan';
import { computeInCount } from '../../src/server/store';

// 本机真实数据；数据在实时变动，只断言结构性条件。目录不存在时整组跳过。
const PROJECTS_ROOT = process.env.EDM_REAL_ROOT ?? 'D:\\OneDrive\\Project Files';
const REAL = ['Pi', 'gren-ssh', 'electron-mall-manager']
  .map((name) => join(PROJECTS_ROOT, name))
  .filter((p) => existsSync(notesDir(p)));

describe.if(REAL.length > 0)('真实笔记目录', () => {
  for (const project of REAL) {
    test(`${project}：每篇都有 id/lifecycle/title，lifecycle 合法，引用图谱项目内封闭`, async () => {
      const { notes, scanMs } = await scanNotes(notesDir(project));
      expect(notes.length).toBeGreaterThan(0);
      const ids = new Set(notes.map((n) => n.id));
      for (const n of notes) {
        expect(n.id).toMatch(/^(implemented|proposed|rejected|archived)\/[^/]+\/.+\.md$/);
        expect(LIFECYCLES).toContain(n.lifecycle);
        expect(n.title.length).toBeGreaterThan(0);
        expect(n.decision.length).toBeGreaterThan(0);
        for (const link of n.links) {
          if (link.kind === 'resolved') expect(ids.has(link.targetId)).toBe(true);
        }
      }
      for (const target of computeInCount(notes).keys()) expect(ids.has(target)).toBe(true);
      expect(scanMs).toBeLessThan(2000);
    });
  }

  test('rejected 笔记都带 verdict', async () => {
    for (const project of REAL) {
      const { notes } = await scanNotes(notesDir(project));
      for (const n of notes.filter((x) => x.lifecycle === 'rejected')) expect(n.verdict.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **步骤 2：运行集成测试**

```bash
bun test tests/integration/real-notes.test.ts
```

预期：`4 pass`，`0 fail`（本机无这些目录时为 skip）

- [ ] **步骤 3：编写服务入口**

此时 `src/client/index.html` 还不存在，入口要到任务 18 才能启动；本步只落文件。`--prod` 关闭 HMR。

`src/server/main.ts`：

```typescript
import { join, resolve } from 'node:path';
import index from '../client/index.html';
import { createServer } from './app';
import { Hub } from './hub';
import { checkNodeModulesSync } from './onedrive';

const appDir = resolve(import.meta.dir, '..', '..');
const configPath = resolve(process.env.EDM_CONFIG ?? join(appDir, 'config.json'));
const development = !process.argv.includes('--prod');

const hub = new Hub({ configPath });
await hub.start();

const oneDriveWarning = await checkNodeModulesSync(appDir);
if (oneDriveWarning) console.warn(`[onedrive] ${oneDriveWarning}`);

const server = createServer({ hub, port: hub.config.current.port, index, development });
const projects = hub.listMeta();
console.log(`工程决策中心：http://127.0.0.1:${server.port}  （${projects.length} 个项目，配置 ${configPath}）`);

function shutdown(): void {
  hub.stop();
  void server.stop(true);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **步骤 4：全量测试**

```bash
bun test
```

预期：`88 pass`，`0 fail`（12 个文件；真实数据测试在本机为 4 个）

- [ ] **步骤 5：Commit**

```bash
git add src/server/main.ts tests/integration/real-notes.test.ts
git commit -m "feat: 服务入口与真实笔记集成测试"
```

## 第三部分：前端纯逻辑

### 任务 15：路由、格式化与标签

URL 形态 `#<项目>/<视图>[/note=<笔记>]`（规格 §6.3）。非法项目回落左栏首个可见项目，非法视图回落 `baseline`；兼容旧看板的 `#note=<id>` 与 `#<视图>`。

**文件：**
- 创建：`src/client/router.ts`
- 创建：`src/client/format.ts`
- 创建：`src/client/labels.ts`
- 测试：`tests/client/router.test.ts`

- [ ] **步骤 1：编写失败的测试**

`tests/client/router.test.ts`：

````typescript
import { describe, expect, test } from 'bun:test';
import { formatHash, normalizeRoute, parseHash } from '../../src/client/router';
import { plainText, relativeTime } from '../../src/client/format';

describe('router', () => {
  test('解析 #项目/视图/note=笔记', () => {
    expect(parseHash('#Pi/baseline/note=2026-10-11-subagent-redesign')).toEqual({
      projectId: 'Pi',
      view: 'baseline',
      note: '2026-10-11-subagent-redesign',
    });
  });

  test('format 与 parse 往返，项目名与笔记 id 中的特殊字符被编码', () => {
    const route = { projectId: '项目 A', view: 'timeline' as const, note: 'implemented/feature/x.md' };
    const hash = formatHash(route);
    expect(hash).toBe('#%E9%A1%B9%E7%9B%AE%20A/timeline/note=implemented%2Ffeature%2Fx.md');
    expect(normalizeRoute(parseHash(hash), ['项目 A'], ['项目 A'])).toEqual(route);
  });

  test('未编码的笔记路径也能解析', () => {
    expect(parseHash('#Pi/directory/note=implemented/feature/x.md').note).toBe('implemented/feature/x.md');
  });

  test('非法项目回落首个可见项目，非法视图回落 baseline', () => {
    expect(normalizeRoute(parseHash('#Nope/whatever'), ['Pi', 'gren'], ['gren', 'Pi'])).toEqual({
      projectId: 'gren',
      view: 'baseline',
      note: null,
    });
  });

  test('隐藏项目可通过 hash 直达', () => {
    expect(normalizeRoute(parseHash('#Hidden/timeline'), ['Pi', 'Hidden'], ['Pi'])?.projectId).toBe('Hidden');
  });

  test('兼容旧看板 #note=<id> 与 #<视图>', () => {
    expect(normalizeRoute(parseHash('#note=implemented%2Fa%2Fb.md'), ['Pi'], ['Pi'])).toEqual({
      projectId: 'Pi',
      view: 'baseline',
      note: 'implemented/a/b.md',
    });
    expect(normalizeRoute(parseHash('#timeline'), ['Pi'], ['Pi'])?.view).toBe('timeline');
  });

  test('没有项目时返回 null；空 hash 回落首个项目', () => {
    expect(normalizeRoute(parseHash(''), [], [])).toBeNull();
    expect(normalizeRoute(parseHash(''), ['Pi'], ['Pi'])).toEqual({ projectId: 'Pi', view: 'baseline', note: null });
  });
});

describe('format', () => {
  const now = Date.parse('2026-10-12T12:00:00');
  test('relativeTime 分档', () => {
    expect(relativeTime(0, now)).toBe('—');
    expect(relativeTime(now - 10_000, now)).toBe('刚刚');
    expect(relativeTime(now - 12 * 60_000, now)).toBe('12m 前');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h 前');
    expect(relativeTime(now - 30 * 3_600_000, now)).toBe('昨天');
    expect(relativeTime(now - 5 * 86_400_000, now)).toBe('5 天前');
    expect(relativeTime(Date.parse('2026-01-02T08:00:00'), now)).toBe('2026-01-02');
  });

  test('plainText 去掉 Markdown 标记', () => {
    expect(plainText('### 标题\n- **粗体** 与 `code`\n见 [链接](./a.md)\n```\n代码\n```')).toBe('标题 粗体 与 code 见 链接');
  });
});
````

- [ ] **步骤 2：运行测试确认失败**

```bash
bun test tests/client/router.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/client/router'`

- [ ] **步骤 3：编写实现（1/3）**

`src/client/router.ts`：

```typescript
export const VIEWS = ['baseline', 'timeline', 'alternatives', 'directory'] as const;
export type ViewId = (typeof VIEWS)[number];

export const VIEW_LABELS: Record<ViewId, string> = {
  baseline: '🏛️ 架构基线',
  timeline: '⏱️ 演进时间线',
  alternatives: '🛡️ 避坑智库',
  directory: '📋 决策清单',
};

export type Route = { projectId: string; view: ViewId; note: string | null };
export type ParsedHash = { projectId: string | null; view: string | null; note: string | null };

function isView(value: string | null): value is ViewId {
  return value !== null && (VIEWS as readonly string[]).includes(value);
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 解析 `#<项目>/<视图>[/note=<笔记>]`，兼容旧看板的 `#note=<id>` 与 `#<视图>` */
export function parseHash(hash: string): ParsedHash {
  const body = hash.replace(/^#/, '');
  if (!body) return { projectId: null, view: null, note: null };
  if (body.startsWith('note=')) return { projectId: null, view: null, note: decode(body.slice(5)) };
  const [project = '', view = '', ...rest] = body.split('/');
  const tail = rest.join('/');
  return {
    projectId: project ? decode(project) : null,
    view: view || null,
    note: tail.startsWith('note=') ? decode(tail.slice(5)) || null : null,
  };
}

/**
 * 把解析结果规整为合法路由：未知项目回落到 fallbackIds 的首个，未知视图回落 baseline。
 * knownIds 是全部项目（含隐藏），fallbackIds 是左栏可见项目（已排序）。没有任何项目时返回 null。
 */
export function normalizeRoute(parsed: ParsedHash, knownIds: readonly string[], fallbackIds: readonly string[]): Route | null {
  let { projectId, view } = parsed;
  if (projectId && !knownIds.includes(projectId) && isView(projectId)) {
    view = projectId;
    projectId = null;
  }
  const id = projectId && knownIds.includes(projectId) ? projectId : (fallbackIds[0] ?? knownIds[0]);
  if (!id) return null;
  return { projectId: id, view: isView(view) ? view : 'baseline', note: parsed.note };
}

export function formatHash(route: Route): string {
  const base = `#${encodeURIComponent(route.projectId)}/${route.view}`;
  return route.note ? `${base}/note=${encodeURIComponent(route.note)}` : base;
}
```

- [ ] **步骤 4：编写实现（2/3）**

`src/client/format.ts`：

````typescript
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 左栏新鲜度：刚刚 / 12m 前 / 3h 前 / 昨天 / 5 天前 / 日期 */
export function relativeTime(ms: number, now = Date.now()): string {
  if (!ms) return '—';
  const diff = Math.max(0, now - ms);
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m 前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h 前`;
  if (diff < 2 * DAY) return '昨天';
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Markdown → 单行纯文本，用于卡片摘要与检索 */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/[*`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
````

- [ ] **步骤 5：编写实现（3/3）**

`src/client/labels.ts`：

```typescript
import type { Lifecycle } from '../shared/types';

export const STATUS_LABELS: Record<Lifecycle, string> = {
  implemented: '已落地',
  proposed: '待评审',
  rejected: '已否决',
  archived: '已归档',
};

const CLASS_LABELS: Record<string, string> = {
  architecture: '架构设计',
  feature: '功能特性',
  'bug-fix': '缺陷修复',
  simplification: '化简裁撤',
  process: '流程规范',
  testing: '测试基建',
};

export function classLabel(cls: string): string {
  return CLASS_LABELS[cls] ?? cls;
}

/** 左栏状态占比条：落地绿 / 待评审黄 / 否决红 / 归档灰 */
export const LIFECYCLE_COLORS: Record<Lifecycle, string> = {
  implemented: '#059669',
  proposed: '#D97706',
  rejected: '#DC2626',
  archived: '#94A3B8',
};

const PALETTE = ['#7C3AED', '#1D4ED8', '#0D9488', '#D97706', '#DC2626', '#0891B2'];

export function projectColor(order: number): string {
  return PALETTE[order % PALETTE.length]!;
}
```

- [ ] **步骤 6：运行测试确认通过**

```bash
bun test tests/client/router.test.ts
```

预期：`9 pass`，`0 fail`

- [ ] **步骤 7：Commit**

```bash
git add tests/client/router.test.ts src/client/router.ts src/client/format.ts src/client/labels.ts
git commit -m "feat: hash 路由、相对时间与中文标签"
```

### 任务 16：视图计算与筛选状态

把旧看板 `renderBaseline / renderTimeline / renderAlternatives / renderDirectory` 里的数据逻辑抽成纯函数。避坑卡的否决原因改用结构化 `verdict`（修正旧版 `split('\n')[2]`）。KPI 跳转直接设状态（修正旧版绕 DOM 清控件）。

**文件：**
- 创建：`src/client/derive.ts`
- 创建：`src/client/state/filters.ts`
- 测试：`tests/client/derive.test.ts`

- [ ] **步骤 1：编写失败的测试**

`tests/client/derive.test.ts`：

```typescript
import { describe, expect, test } from 'bun:test';
import type { LinkResult, NoteSummary } from '../../src/shared/types';
import {
  chambers,
  computeKpis,
  directory,
  findNote,
  incoming,
  pillars,
  pitfalls,
  searchNotes,
  timeline,
} from '../../src/client/derive';
import { filtersReducer, INITIAL_FILTERS } from '../../src/client/state/filters';

function n(id: string, over: Partial<NoteSummary> = {}): NoteSummary {
  const [lifecycle, cls, file] = id.split('/') as [NoteSummary['lifecycle'], string, string];
  const slug = file.replace(/\.md$/, '');
  return {
    id,
    slug,
    lifecycle,
    cls,
    date: /^\d{4}-\d{2}-\d{2}/.exec(slug)?.[0] ?? '',
    title: slug,
    verdict: '',
    problem: '',
    decision: '',
    alternatives: '',
    consequences: '',
    extraSections: [],
    links: [],
    hash: '0',
    ...over,
  };
}

const link = (targetId: string): LinkResult => ({ kind: 'resolved', targetId, rawHref: targetId, anchor: '' });

const NOTES = [
  n('implemented/architecture/2026-10-01-a.md', { decision: '**决定** A' }),
  n('implemented/feature/2026-09-15-b.md', { links: [link('implemented/architecture/2026-10-01-a.md')] }),
  n('proposed/feature/2026-09-01-c.md'),
  n('rejected/architecture/2026-08-20-d.md', { verdict: '被 [新](../x.md) 取代', problem: '老问题' }),
  n('implemented/simplification/2026-08-01-e.md', {
    alternatives: `- **保留旧实现**：维护成本高\n- ${'无冒号的长备选'.repeat(8)}\n- 短`,
  }),
  n('archived/process/no-date.md'),
];
const IN_COUNT = { 'implemented/architecture/2026-10-01-a.md': 1 };

describe('基线', () => {
  test('KPI 计数与跳转目标', () => {
    expect(computeKpis(NOTES).map((k) => [k.key, k.count])).toEqual([
      ['implemented', 3],
      ['proposed', 1],
      ['rejected', 1],
      ['simplification', 1],
    ]);
    expect(computeKpis(NOTES)[3]!.target).toEqual({ cls: 'simplification' });
  });

  test('承重墙只取已落地，按被引用降序', () => {
    expect(pillars(NOTES, IN_COUNT).map((x) => x.slug)).toEqual(['2026-10-01-a', '2026-09-15-b', '2026-08-01-e']);
    expect(pillars(NOTES, IN_COUNT, 1)).toHaveLength(1);
  });

  test('分类阵列只收已落地与待评审，固定六列', () => {
    const result = chambers(NOTES);
    expect(result.map((c) => c.cls)).toEqual(['architecture', 'feature', 'bug-fix', 'simplification', 'process', 'testing']);
    expect(result.find((c) => c.cls === 'feature')!.notes).toHaveLength(2);
    expect(result.find((c) => c.cls === 'architecture')!.notes.map((x) => x.slug)).toEqual(['2026-10-01-a']);
  });
});

describe('时间线', () => {
  test('月份 × 分类正交筛选，无日期笔记不出现', () => {
    const all = timeline(NOTES, '', '');
    expect(all.total).toBe(5);
    expect(all.months).toEqual([
      { month: '2026-10', count: 1 },
      { month: '2026-09', count: 2 },
      { month: '2026-08', count: 2 },
    ]);
    const sliced = timeline(NOTES, '2026-09', 'feature');
    expect(sliced.filtered.map((x) => x.slug)).toEqual(['2026-09-15-b', '2026-09-01-c']);
    expect(sliced.groups).toHaveLength(1);
    expect(sliced.classCounts.find((c) => c.cls === 'feature')!.count).toBe(2);
  });
});

describe('避坑智库', () => {
  test('否决提案用 verdict 作为权衡依据；备选按冒号拆标题', () => {
    const items = pitfalls(NOTES, '');
    expect(items[0]).toMatchObject({ discarded: '[已否决提案] 2026-08-20-d', crux: '被 新 取代', winner: '提案直接否决' });
    expect(items[1]).toMatchObject({ discarded: '保留旧实现', crux: '维护成本高' });
    expect(items[2]!.discarded).toHaveLength(45);
    expect(items).toHaveLength(3);
  });

  test('关键字过滤', () => {
    expect(pitfalls(NOTES, '维护').map((p) => p.discarded)).toEqual(['保留旧实现']);
  });
});

describe('决策清单与搜索', () => {
  test('状态 / 分类 / 关键字 / 排序', () => {
    const base = { status: '' as const, cls: '', sort: 'new' as const, query: '' };
    expect(directory(NOTES, IN_COUNT, { ...base, status: 'implemented' })).toHaveLength(3);
    expect(directory(NOTES, IN_COUNT, { ...base, cls: 'feature' })).toHaveLength(2);
    expect(directory(NOTES, IN_COUNT, { ...base, query: '决定' }).map((x) => x.slug)).toEqual(['2026-10-01-a']);
    expect(directory(NOTES, IN_COUNT, { ...base, sort: 'old' })[0]!.slug).toBe('no-date');
    expect(directory(NOTES, IN_COUNT, { ...base, sort: 'cites' })[0]!.slug).toBe('2026-10-01-a');
  });

  test('全局搜索返回总数与前 N 条', () => {
    expect(searchNotes(NOTES, '2026', 2)).toMatchObject({ total: 5 });
    expect(searchNotes(NOTES, '2026', 2).top).toHaveLength(2);
    expect(searchNotes(NOTES, '  ').total).toBe(0);
  });
});

describe('抽屉辅助', () => {
  test('findNote 先按 id 再按 slug', () => {
    expect(findNote(NOTES, '2026-09-01-c')?.id).toBe('proposed/feature/2026-09-01-c.md');
    expect(findNote(NOTES, 'implemented/feature/2026-09-15-b.md')?.slug).toBe('2026-09-15-b');
    expect(findNote(NOTES, 'missing')).toBeUndefined();
  });

  test('incoming 找出引用者', () => {
    expect(incoming(NOTES, 'implemented/architecture/2026-10-01-a.md').map((x) => x.slug)).toEqual(['2026-09-15-b']);
  });
});

describe('filtersReducer', () => {
  test('KPI 跳转设置状态或分类并清掉另一项', () => {
    const s1 = filtersReducer({ ...INITIAL_FILTERS, cls: 'feature' }, { type: 'jump', target: { status: 'rejected' } });
    expect(s1).toMatchObject({ status: 'rejected', cls: '' });
    const s2 = filtersReducer(s1, { type: 'jump', target: { cls: 'simplification' } });
    expect(s2).toMatchObject({ status: '', cls: 'simplification' });
  });

  test('重置时间线 / 清单筛选只影响各自字段', () => {
    const s = { ...INITIAL_FILTERS, timelineMonth: '2026-09', status: 'proposed' as const, altQuery: 'x' };
    expect(filtersReducer(s, { type: 'reset-timeline' })).toMatchObject({ timelineMonth: '', status: 'proposed', altQuery: 'x' });
    expect(filtersReducer(s, { type: 'reset-directory' })).toMatchObject({ timelineMonth: '2026-09', status: '' });
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
bun test tests/client/derive.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/client/derive'`

- [ ] **步骤 3：编写实现（1/2）**

`src/client/derive.ts`：

```typescript
// 视图的纯计算：输入笔记列表与筛选条件，输出要渲染的数据。全部无副作用，便于单测。
import { CLASSES, type Lifecycle, type NoteSummary } from '../shared/types';
import { plainText } from './format';

export type InCount = Readonly<Record<string, number>>;

export function cites(inCount: InCount, id: string): number {
  return inCount[id] ?? 0;
}

// ---------- 架构基线 ----------

export type KpiTarget = { status: Lifecycle } | { cls: string };
export type Kpi = { key: string; label: string; caption: string; color: string; count: number; target: KpiTarget };

export function computeKpis(notes: readonly NoteSummary[]): Kpi[] {
  const byStatus = (s: Lifecycle) => notes.filter((n) => n.lifecycle === s).length;
  return [
    { key: 'implemented', label: '现行落地', caption: '生产已交付生效', color: '#059669', count: byStatus('implemented'), target: { status: 'implemented' } },
    { key: 'proposed', label: '待评审提案', caption: '待团队确认', color: '#D97706', count: byStatus('proposed'), target: { status: 'proposed' } },
    { key: 'rejected', label: '避坑否决', caption: '防重犯事实存档', color: '#DC2626', count: byStatus('rejected'), target: { status: 'rejected' } },
    {
      key: 'simplification',
      label: '化简裁撤',
      caption: '代码只减不增',
      color: '#0D9488',
      count: notes.filter((n) => n.cls === 'simplification').length,
      target: { cls: 'simplification' },
    },
  ];
}

/** 系统承重墙：已落地笔记按被引用次数降序取前 N（同分保持原顺序） */
export function pillars(notes: readonly NoteSummary[], inCount: InCount, limit = 6): NoteSummary[] {
  return notes
    .filter((n) => n.lifecycle === 'implemented')
    .map((n, i) => ({ n, i }))
    .sort((a, b) => cites(inCount, b.n.id) - cites(inCount, a.n.id) || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.n);
}

export function pillarAbstract(note: NoteSummary): string {
  return plainText(note.decision || note.problem) || '系统核心架构协议';
}

/** 所有出现过的分类：固定六类在前，其余按字母序追加 */
export function classesOf(notes: readonly NoteSummary[]): string[] {
  const extra = [...new Set(notes.map((n) => n.cls))].filter((c) => !(CLASSES as readonly string[]).includes(c)).sort();
  return [...CLASSES, ...extra];
}

/** 领域分类阵列：现行生效（已落地 + 待评审）按分类分组 */
export function chambers(notes: readonly NoteSummary[]): { cls: string; notes: NoteSummary[] }[] {
  const active = notes.filter((n) => n.lifecycle === 'implemented' || n.lifecycle === 'proposed');
  return classesOf(notes).map((cls) => ({ cls, notes: active.filter((n) => n.cls === cls) }));
}

// ---------- 演进时间线 ----------

export type TimelineData = {
  total: number;
  months: { month: string; count: number }[];
  classCounts: { cls: string; count: number }[];
  filtered: NoteSummary[];
  groups: { month: string; notes: NoteSummary[] }[];
};

function groupByMonth(notes: readonly NoteSummary[]): Map<string, NoteSummary[]> {
  const groups = new Map<string, NoteSummary[]>();
  for (const n of notes) {
    const month = n.date.slice(0, 7);
    const list = groups.get(month) ?? [];
    list.push(n);
    groups.set(month, list);
  }
  return groups;
}

/** 月份胶囊 × 分类胶囊正交筛选；胶囊上的计数基于全部带日期笔记 */
export function timeline(notes: readonly NoteSummary[], month: string, cls: string): TimelineData {
  const dated = notes.filter((n) => n.date).sort((a, b) => b.date.localeCompare(a.date));
  const filtered = dated.filter((n) => (!month || n.date.startsWith(month)) && (!cls || n.cls === cls));
  return {
    total: dated.length,
    months: [...groupByMonth(dated)].map(([m, list]) => ({ month: m, count: list.length })),
    classCounts: classesOf(notes).map((c) => ({ cls: c, count: dated.filter((n) => n.cls === c).length })),
    filtered,
    groups: [...groupByMonth(filtered)].map(([m, list]) => ({ month: m, notes: list })),
  };
}

// ---------- 避坑智库 ----------

export type Pitfall = {
  key: string;
  noteId: string;
  slug: string;
  cls: string;
  title: string;
  discarded: string;
  crux: string;
  winner: string;
};

function cleanAlternative(part: string): string {
  return part
    .replace(/^[-#* ]+/, '')
    .trim()
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1');
}

/** 否决提案 + 每条「曾考虑的备选」拆成一张避坑卡 */
export function pitfalls(notes: readonly NoteSummary[], query: string): Pitfall[] {
  const items: Pitfall[] = [];
  for (const n of notes) {
    const base = { noteId: n.id, slug: n.slug, cls: n.cls, title: n.title };
    if (n.lifecycle === 'rejected') {
      items.push({
        ...base,
        key: `${n.id}#rejected`,
        discarded: `[已否决提案] ${n.title}`,
        crux: plainText(n.verdict) || plainText(n.problem) || '审慎否决，防止重犯。',
        winner: '提案直接否决',
      });
    }
    if (!n.alternatives) continue;
    n.alternatives.split(/\n(?=###? |- )/).forEach((part, i) => {
      const clean = cleanAlternative(part);
      if (clean.length <= 5) return;
      const colon = clean.indexOf('：') > -1 ? clean.indexOf('：') : clean.indexOf(':');
      const hasHeading = colon > 0 && colon < 35;
      items.push({
        ...base,
        key: `${n.id}#alt-${i}`,
        discarded: hasHeading ? clean.slice(0, colon) : clean.slice(0, 45),
        crux: (hasHeading ? clean.slice(colon + 1) : clean).trim(),
        winner: `采纳决策: ${n.title}`,
      });
    });
  }
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => `${it.discarded} ${it.crux} ${it.title}`.toLowerCase().includes(q));
}

// ---------- 决策清单 / 全局搜索 ----------

export type SortMode = 'new' | 'old' | 'cites';

export function matchesQuery(note: NoteSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${note.title} ${note.slug} ${note.problem} ${note.decision}`.toLowerCase().includes(q);
}

export function directory(
  notes: readonly NoteSummary[],
  inCount: InCount,
  opts: { status: Lifecycle | ''; cls: string; sort: SortMode; query: string },
): NoteSummary[] {
  const list = notes.filter(
    (n) => (!opts.status || n.lifecycle === opts.status) && (!opts.cls || n.cls === opts.cls) && matchesQuery(n, opts.query),
  );
  if (opts.sort === 'new') return list.sort((a, b) => b.date.localeCompare(a.date));
  if (opts.sort === 'old') return list.sort((a, b) => a.date.localeCompare(b.date));
  return list.sort((a, b) => cites(inCount, b.id) - cites(inCount, a.id));
}

export function searchNotes(notes: readonly NoteSummary[], query: string, limit = 7): { total: number; top: NoteSummary[] } {
  if (!query.trim()) return { total: 0, top: [] };
  const matches = notes.filter((n) => matchesQuery(n, query));
  return { total: matches.length, top: matches.slice(0, limit) };
}

// ---------- 抽屉 ----------

/** 按 id 找，找不到再按 slug 找（深链用 slug） */
export function findNote(notes: readonly NoteSummary[], key: string): NoteSummary | undefined {
  return notes.find((n) => n.id === key) ?? notes.find((n) => n.slug === key);
}

/** 入链：哪些笔记引用了它 */
export function incoming(notes: readonly NoteSummary[], id: string): NoteSummary[] {
  return notes.filter((n) => n.id !== id && n.links.some((l) => l.kind === 'resolved' && l.targetId === id));
}
```

- [ ] **步骤 4：编写实现（2/2）**

`src/client/state/filters.ts`：

```typescript
import type { Lifecycle } from '../../shared/types';
import type { KpiTarget, SortMode } from '../derive';

/** 视图内筛选状态。按项目隔离：切视图保留，切项目重置（由 Workspace 的 key 保证）。 */
export type Filters = {
  timelineMonth: string;
  timelineClass: string;
  altQuery: string;
  status: Lifecycle | '';
  cls: string;
  sort: SortMode;
};

export const INITIAL_FILTERS: Filters = {
  timelineMonth: '',
  timelineClass: '',
  altQuery: '',
  status: '',
  cls: '',
  sort: 'new',
};

export type FilterAction =
  | { type: 'set'; patch: Partial<Filters> }
  | { type: 'reset-timeline' }
  | { type: 'reset-directory' }
  | { type: 'jump'; target: KpiTarget };

export function filtersReducer(state: Filters, action: FilterAction): Filters {
  switch (action.type) {
    case 'set':
      return { ...state, ...action.patch };
    case 'reset-timeline':
      return { ...state, timelineMonth: '', timelineClass: '' };
    case 'reset-directory':
      return { ...state, status: '', cls: '' };
    case 'jump':
      return 'status' in action.target
        ? { ...state, status: action.target.status, cls: '' }
        : { ...state, status: '', cls: action.target.cls };
  }
}
```

- [ ] **步骤 5：运行测试确认通过**

```bash
bun test tests/client/derive.test.ts
```

预期：`12 pass`，`0 fail`

- [ ] **步骤 6：Commit**

```bash
git add tests/client/derive.test.ts src/client/derive.ts src/client/state/filters.ts
git commit -m "feat: 四个视图的纯计算与筛选 reducer"
```

### 任务 17：轻量 Markdown 解析

解析成 AST、由 React 渲染，不拼 HTML 字符串，天然防注入（旧版靠手动转义 + `innerHTML`）。

**文件：**
- 创建：`src/client/markdown.ts`
- 测试：`tests/client/markdown.test.ts`

- [ ] **步骤 1：编写失败的测试**

`tests/client/markdown.test.ts`：

````typescript
import { describe, expect, test } from 'bun:test';
import { parseBlocks, parseInline } from '../../src/client/markdown';

describe('parseInline', () => {
  test('行内代码 / 粗体 / 链接 / 纯文本', () => {
    expect(parseInline('见 `a.ts` 与 **重点 [链](./x.md)** 结束')).toEqual([
      { t: 'text', v: '见 ' },
      { t: 'code', v: 'a.ts' },
      { t: 'text', v: ' 与 ' },
      { t: 'strong', c: [{ t: 'text', v: '重点 ' }, { t: 'link', href: './x.md', c: [{ t: 'text', v: '链' }] }] },
      { t: 'text', v: ' 结束' },
    ]);
  });

  test('代码里的星号不当粗体', () => {
    expect(parseInline('`**x**`')).toEqual([{ t: 'code', v: '**x**' }]);
  });
});

describe('parseBlocks', () => {
  test('段落、子标题、列表、引用', () => {
    const blocks = parseBlocks('第一行\n第二行\n\n### 涉及文件\n\n- a\n  续行\n- b\n\n1. x\n2. y\n\n> 引用');
    expect(blocks.map((b) => b.t)).toEqual(['p', 'h', 'ul', 'ol', 'quote']);
    expect(blocks[0]).toEqual({ t: 'p', c: [{ t: 'text', v: '第一行\n第二行' }] });
    expect(blocks[1]).toMatchObject({ t: 'h', level: 3 });
    expect(blocks[2]).toEqual({ t: 'ul', items: [[{ t: 'text', v: 'a\n续行' }], [{ t: 'text', v: 'b' }]] });
  });

  test('围栏代码块原样保留，内部不解析', () => {
    expect(parseBlocks('前\n```ts\n## 不是标题\n- 不是列表\n```\n后')).toEqual([
      { t: 'p', c: [{ t: 'text', v: '前' }] },
      { t: 'pre', lang: 'ts', v: '## 不是标题\n- 不是列表' },
      { t: 'p', c: [{ t: 'text', v: '后' }] },
    ]);
  });

  test('未闭合围栏吞到结尾', () => {
    expect(parseBlocks('```\nx\ny')).toEqual([{ t: 'pre', lang: '', v: 'x\ny' }]);
  });

  test('空输入返回空数组', () => {
    expect(parseBlocks('')).toEqual([]);
  });
});
````

- [ ] **步骤 2：运行测试确认失败**

```bash
bun test tests/client/markdown.test.ts
```

预期：FAIL，报错 `Cannot find module '../../src/client/markdown'`

- [ ] **步骤 3：编写实现**

`src/client/markdown.ts`：

```typescript
// 轻量 Markdown → AST。只覆盖笔记里实际用到的语法：段落、###~###### 标题、列表、引用、围栏代码、行内代码、粗体、链接。
// 渲染交给 MarkdownBody.tsx 生成 React 元素，不拼 HTML 字符串，天然防注入。

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'pre'; lang: string; v: string };

const INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\[[^\]\n]*\]\([^)\s]+(?:\s+"[^"\n]*")?\))/g;
const LINK_PARTS_RE = /^\[([^\]\n]*)\]\(([^)\s]+)/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([\w-]*)/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE_RE)) {
    if (m.index! > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    const token = m[0];
    if (m[1]) out.push({ t: 'code', v: token.slice(1, -1) });
    else if (m[2]) out.push({ t: 'strong', c: parseInline(token.slice(2, -2)) });
    else {
      const parts = LINK_PARTS_RE.exec(token)!;
      out.push({ t: 'link', href: parts[2]!, c: parseInline(parts[1]!) });
    }
    last = m.index! + token.length;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}

type ListKind = 'ul' | 'ol';

export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: { kind: ListKind; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join('\n')) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: list.kind, items: list.items.map(parseInline) });
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ t: 'quote', c: parseInline(quote.join('\n')) });
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const fence = FENCE_RE.exec(line);
    if (fence) {
      flushAll();
      const marker = fence[1]!;
      const body: string[] = [];
      for (i += 1; i < lines.length; i += 1) {
        const closing = lines[i]!.trim();
        if (closing.startsWith(marker[0]!.repeat(marker.length)) && /^(`+|~+)$/.test(closing)) break;
        body.push(lines[i]!);
      }
      blocks.push({ t: 'pre', lang: fence[2] ?? '', v: body.join('\n') });
      continue;
    }
    if (!line.trim()) {
      flushAll();
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushAll();
      blocks.push({ t: 'h', level: heading[1]!.length, c: parseInline(heading[2]!.trim()) });
      continue;
    }
    const ul = UL_RE.exec(line);
    const ol = ul ? null : OL_RE.exec(line);
    if (ul || ol) {
      const kind: ListKind = ul ? 'ul' : 'ol';
      flushPara();
      flushQuote();
      if (list && list.kind !== kind) flushList();
      list ??= { kind, items: [] };
      list.items.push((ul ?? ol)![1]!);
      continue;
    }
    const q = QUOTE_RE.exec(line);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1]!);
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1] += `\n${line.trim()}`;
      continue;
    }
    flushList();
    flushQuote();
    para.push(line);
  }
  flushAll();
  return blocks;
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
bun test tests/client/markdown.test.ts
```

预期：`6 pass`，`0 fail`

- [ ] **步骤 5：Commit**

```bash
git add tests/client/markdown.test.ts src/client/markdown.ts
git commit -m "feat: 轻量 Markdown → AST"
```

## 第四部分：前端界面

### 任务 18：样式、字体与可启动的空壳

把旧看板的设计令牌和样式平移过来，下载本地字体，挂上 HTML 入口和占位 App，让服务第一次真正跑起来。

**文件：**
- 创建：`scripts/fetch-fonts.ts`
- 创建：`src/client/assets/fonts/*.woff2`（脚本下载）
- 创建：`src/client/styles/tokens.css`、`fonts.css`、`app.css`、`shell.css`、`drawer.css`
- 创建：`src/client/index.html`、`src/client/main.tsx`、`src/client/App.tsx`（占位，任务 23 替换）

- [ ] **步骤 1：编写字体下载脚本**

`scripts/fetch-fonts.ts`：

```typescript
// 一次性脚本：从 Google Fonts 下载 latin 子集可变字体到 src/client/assets/fonts/。
// 运行：bun run fonts。字体随仓库提交，运行期完全离线。
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FONTS = [
  { file: 'SpaceGrotesk-latin.woff2', family: 'Space+Grotesk:wght@300..700' },
  { file: 'PlusJakartaSans-latin.woff2', family: 'Plus+Jakarta+Sans:wght@200..800' },
  { file: 'JetBrainsMono-latin.woff2', family: 'JetBrains+Mono:wght@100..800' },
  { file: 'JetBrainsMono-Italic-latin.woff2', family: 'JetBrains+Mono:ital,wght@1,100..800' },
];

// 需要现代浏览器 UA，Google Fonts 才会返回 woff2
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** 从 css2 响应中取出 `/* latin *\/` 块的 woff2 地址 */
export function latinWoff2Url(css: string): string | null {
  return /\/\* latin \*\/\s*@font-face\s*\{[^}]*?src:\s*url\((https:\/\/[^)]+\.woff2)\)/.exec(css)?.[1] ?? null;
}

async function main(): Promise<void> {
  const outDir = join(import.meta.dir, '..', 'src', 'client', 'assets', 'fonts');
  await mkdir(outDir, { recursive: true });
  for (const font of FONTS) {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${font.family}&display=swap`, { headers: { 'User-Agent': UA } })).text();
    const url = latinWoff2Url(css);
    if (!url) throw new Error(`未在 CSS 中找到 latin 子集：${font.family}`);
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    await writeFile(join(outDir, font.file), bytes);
    console.log(`${font.file}  ${(bytes.length / 1024).toFixed(1)} KB`);
  }
}

if (import.meta.main) await main();
```

- [ ] **步骤 2：下载字体**

> 这一步会从 fonts.gstatic.com 下载 4 个 woff2（共约 103 KB）。由 AI 代理执行时，先向用户说明并取得同意。

```bash
bun run fonts
```

预期：打印 4 行，大小约为 SpaceGrotesk 22 KB、PlusJakartaSans 27 KB、JetBrainsMono 31 KB、JetBrainsMono-Italic 22 KB。

- [ ] **步骤 3：设计令牌**

平移自旧看板 `:root`，补齐旧版引用了却从未定义的 `--brand-cyan`（规格 §6.6）。

`src/client/styles/tokens.css`：

```css
/* 设计令牌：平移自旧看板 agent-notes-board.html，补齐旧版引用但未定义的 --brand-cyan */
:root {
  --bg-base: #F8FAFC;
  --bg-surface: #FFFFFF;
  --bg-surface-subtle: #F1F5F9;
  --border-subtle: #F1F5F9;
  --border-normal: #E2E8F0;
  --border-focus: #1D4ED8;

  --text-pure: #0A0E1A;
  --text-primary: #0F172A;
  --text-secondary: #475569;
  --text-tertiary: #94A3B8;
  --text-mono-faint: #CBD5E1;

  --brand-blue: #1D4ED8;
  --brand-blue-hover: #2563EB;
  --brand-blue-glow: rgba(29, 78, 216, 0.12);
  --brand-cyan: #0891B2;
  --alert-ruby: #DC2626;
  --alert-ruby-subtle: #FEF2F2;
  --amber-core: #D97706;
  --emerald-live: #059669;
  --purple-meta: #7C3AED;
  --teal-prune: #0D9488;

  --font-display: "Space Grotesk", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-body: "Plus Jakarta Sans", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", "Microsoft YaHei", monospace;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --topbar-h: 64px;
  --rail-w: 186px;
}
```

- [ ] **步骤 4：本地字体声明**

`src/client/styles/fonts.css`：

```css
/* 本地化的 Google Fonts latin 子集（可变字体，一个文件覆盖全部字重）。中文回落系统字体。 */
@font-face {
  font-family: "Space Grotesk";
  src: url("../assets/fonts/SpaceGrotesk-latin.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Plus Jakarta Sans";
  src: url("../assets/fonts/PlusJakartaSans-latin.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "JetBrains Mono";
  src: url("../assets/fonts/JetBrainsMono-latin.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "JetBrains Mono";
  src: url("../assets/fonts/JetBrainsMono-Italic-latin.woff2") format("woff2");
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}
```

- [ ] **步骤 5：主体样式（旧看板平移）**

类名与旧看板一致；`id` 选择器改为类，`.canvas-view` 不再靠 `display` 切换（React 只渲染当前视图）。

`src/client/styles/app.css`：

```css
/* 主体样式：平移自旧看板 agent-notes-board.html，类名保持不变；仅把 id 选择器改为类、去掉 :root（见 tokens.css） */
* { box-sizing: border-box; margin: 0; padding: 0; }

/* 瑞士工程图纸微网格背景 */
body {
  background-color: var(--bg-base);
  background-image:
    linear-gradient(to right, rgba(15, 23, 42, 0.035) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(15, 23, 42, 0.035) 1px, transparent 1px);
  background-size: 28px 28px;
  color: var(--text-primary);
  font: 14px/1.6 var(--font-body);
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  overflow-x: hidden;
}

button { font: inherit; }

/* 顶栏 HUD（磨砂象牙白） */
.hud-topbar {
  position: sticky; top: 0; z-index: 50;
  height: var(--topbar-h); background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border-normal);
  padding: 0 32px; display: flex; align-items: center; gap: 24px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.03);
}

.brand-group { display: flex; align-items: center; gap: 12px; }
.brand-logo {
  width: 32px; height: 32px; border-radius: 6px;
  background: #0F172A; border: 1px solid #0F172A;
  display: flex; align-items: center; justify-content: center;
  position: relative; box-shadow: 0 2px 6px rgba(15,23,42,0.15);
}
.brand-logo::before {
  content: ''; position: absolute; width: 8px; height: 8px;
  background: #60A5FA; border-radius: 50%;
}
.brand-text {
  font-family: var(--font-display); font-size: 16px; font-weight: 700;
  color: #0F172A; letter-spacing: -0.3px; display: flex; align-items: center; gap: 8px;
  white-space: nowrap;
}
.telemetry-chip {
  font-family: var(--font-mono); font-size: 11px; padding: 2px 8px;
  background: #F1F5F9; border: 1px solid var(--border-normal);
  border-radius: var(--radius-sm); color: var(--text-secondary); font-weight: 600;
}

/* 导航控制器 Deck Tabs */
.deck-tabs {
  display: flex; gap: 4px; background: #F1F5F9;
  padding: 3px; border-radius: var(--radius-md); border: 1px solid var(--border-normal);
}
.deck-tab {
  border: 0; background: transparent; color: var(--text-secondary);
  font-family: var(--font-display); font-size: 13px; font-weight: 600;
  padding: 6px 16px; border-radius: var(--radius-sm); cursor: pointer;
  transition: all .18s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex; align-items: center; gap: 8px; position: relative; white-space: nowrap;
}
.deck-tab:hover { color: #0F172A; background: rgba(255,255,255,0.6); }
.deck-tab.active {
  color: #0F172A; background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(15,23,42,0.08);
}
.deck-tab.active::after {
  content: ''; position: absolute; bottom: -1px; left: 20%; right: 20%;
  height: 2px; background: var(--brand-blue);
}

.hud-grow { flex: 1; }

/* 战术全局搜索框 */
.hud-search { position: relative; width: 260px; }
.hud-search input {
  width: 100%; height: 36px; background: #FFFFFF;
  border: 1px solid var(--border-normal); border-radius: var(--radius-sm);
  color: #0F172A; font-family: var(--font-mono); font-size: 12.5px;
  padding: 0 34px 0 34px; outline: none; transition: all .2s;
}
.hud-search input:focus {
  width: 320px; border-color: var(--brand-blue); background: #FFFFFF;
  box-shadow: 0 0 0 3px var(--brand-blue-glow);
}
.hud-search .search-ico {
  position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
  color: var(--text-tertiary); pointer-events: none;
}
.hud-search .shortcut-key {
  position: absolute; right: 9px; top: 50%; transform: translateY(-50%);
  font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary);
  background: #F1F5F9; padding: 1px 5px; border-radius: 3px; border: 1px solid var(--border-normal);
}

/* 即时搜索下拉浮窗 */
.search-popover {
  position: absolute; top: calc(100% + 8px); left: 0; width: 440px;
  background: #FFFFFF; border: 1px solid var(--border-normal);
  border-radius: var(--radius-md); box-shadow: 0 12px 36px rgba(15,23,42,0.14);
  max-height: 420px; overflow-y: auto; z-index: 100;
  display: flex; flex-direction: column; padding: 4px 0;
  animation: viewIn .15s ease-out;
}
.popover-item {
  padding: 10px 14px; cursor: pointer; display: flex; align-items: center; justify-content: space-between;
  gap: 12px; transition: background .12s; border-bottom: 1px solid #F8FAFC;
}
.popover-item:hover, .popover-item.selected { background: #EFF6FF; }
.popover-item-main { flex: 1; min-width: 0; }
.popover-title {
  font-size: 13px; font-weight: 600; color: #0F172A;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 2px;
}
.popover-sub {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary);
  display: flex; align-items: center; gap: 8px;
}
.popover-empty {
  padding: 24px; text-align: center; color: var(--text-tertiary);
  font-family: var(--font-mono); font-size: 12px;
}
.popover-footer {
  padding: 8px 14px; font-family: var(--font-mono); font-size: 11px;
  color: var(--text-tertiary); background: #F8FAFC; border-top: 1px solid var(--border-normal);
  display: flex; justify-content: space-between; align-items: center;
}

/* 实时同步信标 */
.sync-beacon {
  display: flex; align-items: center; gap: 10px;
  background: #FFFFFF; border: 1px solid var(--border-normal);
  border-radius: var(--radius-sm); padding: 6px 14px; font-size: 12px;
  font-family: var(--font-mono); color: var(--text-secondary);
  transition: all .2s; user-select: none; box-shadow: 0 1px 2px rgba(15,23,42,0.04);
  white-space: nowrap;
}
button.sync-beacon { cursor: pointer; }
button.sync-beacon:hover { border-color: var(--brand-blue); color: #0F172A; box-shadow: 0 0 0 3px var(--brand-blue-glow); }
.radar-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #94A3B8; position: relative; flex-shrink: 0;
}
.radar-dot.active { background: var(--emerald-live); }
.radar-dot.active::after {
  content: ''; position: absolute; inset: -4px; border-radius: 50%;
  border: 1px solid var(--emerald-live); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.radar-dot.syncing { background: var(--amber-core); }
@keyframes ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }

/* 主视口画布 */
.mission-canvas {
  max-width: 1440px; width: 100%; margin: 0 auto; padding: 28px 36px 80px;
  display: flex; flex-direction: column; gap: 28px;
}

.canvas-view { animation: viewIn .25s ease-out; }
@keyframes viewIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* 实体白皮书面板 */
.hud-panel {
  background: var(--bg-surface); border: 1px solid var(--border-normal);
  border-radius: var(--radius-md); padding: 24px 28px; position: relative;
  box-shadow: 0 1px 3px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.03);
  overflow: hidden;
}
.panel-masthead {
  display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20px; gap: 12px;
}
.panel-headline {
  font-family: var(--font-display); font-size: 16px; font-weight: 700;
  color: #0F172A; letter-spacing: -0.2px; display: flex; align-items: center; gap: 10px;
}
.panel-annotation {
  font-family: var(--font-mono); font-size: 11.5px; color: var(--text-tertiary);
}

/* KPI 战术度量仪表阵列 */
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-bottom: 28px; }
@media (max-width: 960px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
.kpi-instrument {
  background: var(--bg-surface); border: 1px solid var(--border-normal);
  border-radius: var(--radius-md); padding: 20px 24px; cursor: pointer; text-align: left;
  transition: all .2s; position: relative; overflow: hidden;
  box-shadow: 0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.02);
}
.kpi-instrument:hover {
  border-color: var(--brand-blue); transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(15,23,42,0.08);
}
.kpi-tag {
  font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary);
  display: flex; align-items: center; justify-content: space-between; font-weight: 600;
}
.kpi-dot { width: 6px; height: 6px; border-radius: 50%; }
.kpi-num {
  font-family: var(--font-display); font-size: 38px; font-weight: 700;
  color: #0F172A; line-height: 1.1; margin: 10px 0 6px; letter-spacing: -1px;
}
.kpi-caption { font-size: 12.5px; color: var(--text-tertiary); }
.kpi-accent-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; }

/* 核心承重墙网格 */
.pillars-vault { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px; }
.pillar-specimen {
  background: #FFFFFF; border: 1px solid var(--border-normal);
  border-radius: var(--radius-sm); padding: 18px; cursor: pointer;
  transition: all .2s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex; flex-direction: column; justify-content: space-between; position: relative;
  box-shadow: 0 1px 2px rgba(15,23,42,0.04);
}
.pillar-specimen:hover {
  border-color: var(--brand-blue); transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(29, 78, 216, 0.08);
}
.pillar-specimen::after {
  content: ''; position: absolute; right: 12px; top: 12px;
  width: 6px; height: 6px; border-radius: 50%; background: var(--amber-core);
}
.pillar-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.pillar-core-title {
  font-family: var(--font-display); font-size: 15px; font-weight: 700;
  color: #0F172A; line-height: 1.35; margin-bottom: 10px;
}
.pillar-abstract {
  font-size: 13px; color: var(--text-secondary); line-height: 1.6;
  margin-bottom: 16px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.pillar-telemetry {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-family: var(--font-mono); font-size: 11.5px; color: var(--text-tertiary);
  border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: auto;
}
.pillar-telemetry span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.weight-gauge {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--brand-blue); font-weight: 700; background: #EFF6FF;
  border: 1px solid #BFDBFE; border-radius: 3px; padding: 2px 7px;
}

/* 领域分类矩阵 */
.matrix-chambers {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px; width: 100%;
}
@media (max-width: 1200px) { .matrix-chambers { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 768px) { .matrix-chambers { grid-template-columns: minmax(0, 1fr); } }
.chamber-pod {
  background: #F8FAFC; border: 1px solid var(--border-normal);
  border-radius: var(--radius-sm); padding: 16px; min-width: 0; overflow: hidden;
}
.chamber-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 10px; border-bottom: 1px solid var(--border-normal); margin-bottom: 12px;
}
.chamber-name {
  font-family: var(--font-display); font-size: 13.5px; font-weight: 700;
  color: #0F172A; display: flex; align-items: center; gap: 8px;
}
.chamber-name::before { content: ''; width: 6px; height: 6px; background: var(--brand-cyan); border-radius: 1px; }
.chamber-count { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); font-weight: 600; }
.chamber-stream {
  display: flex; flex-direction: column; gap: 8px; max-height: 420px;
  overflow-y: auto; min-width: 0; width: 100%; padding-right: 4px;
}
.chamber-stream::-webkit-scrollbar { width: 4px; }
.chamber-stream::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }
.chamber-stream::-webkit-scrollbar-track { background: transparent; }
.chamber-empty { color: var(--text-tertiary); font-family: var(--font-mono); font-size: 11px; padding: 8px; }

.specimen-row {
  flex-shrink: 0;
  min-height: 54px; display: flex; flex-direction: column; justify-content: center;
  background: #FFFFFF; border: 1px solid var(--border-normal);
  border-radius: var(--radius-sm); padding: 10px 12px; cursor: pointer; transition: all .15s;
  box-shadow: 0 1px 2px rgba(15,23,42,0.02); min-width: 0; width: 100%;
}
.specimen-row:hover {
  border-color: var(--brand-blue); transform: translateX(2px);
  box-shadow: 0 2px 8px rgba(15,23,42,0.06);
}
.specimen-title {
  font-size: 13px; font-weight: 600; color: #0F172A; line-height: 1.4; margin-bottom: 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;
}
.specimen-info {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); line-height: 1.2;
  display: flex; align-items: center; justify-content: space-between; width: 100%;
}
.specimen-cites { color: var(--brand-blue); }

/* 时间线筛选工具栏 */
.timeline-toolbar {
  display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;
  background: #F8FAFC; border: 1px solid var(--border-normal);
  border-radius: var(--radius-sm); padding: 14px 18px;
}
.filter-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; width: 100%; }
.filter-group-label {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);
  font-weight: 700; display: flex; align-items: center; gap: 6px; flex-shrink: 0; min-width: 76px;
}
.month-pills, .class-pills {
  display: flex; gap: 6px; overflow-x: auto; max-width: calc(100% - 90px); padding-bottom: 2px;
}
.month-pill, .class-pill {
  border: 1px solid var(--border-normal); background: #FFFFFF;
  color: var(--text-secondary); font-family: var(--font-mono); font-size: 11px;
  font-weight: 600; padding: 3px 9px; border-radius: 4px; cursor: pointer;
  transition: all .15s; white-space: nowrap;
}
.month-pill:hover, .class-pill:hover { border-color: var(--brand-blue); color: var(--brand-blue); }
.month-pill.active {
  background: var(--brand-blue); border-color: var(--brand-blue);
  color: #FFFFFF; box-shadow: 0 1px 4px rgba(29,78,216,0.25);
}
.class-pill.active {
  background: #0F172A; border-color: #0F172A;
  color: #FFFFFF; box-shadow: 0 1px 4px rgba(15,23,42,0.2);
}
.filter-summary-bar {
  display: flex; align-items: center; justify-content: space-between;
  border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: 2px;
  font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary);
}
.link-btn {
  background: none; border: 0; color: var(--brand-blue); font-family: var(--font-mono);
  font-size: 11px; cursor: pointer; font-weight: 600;
}

/* 时间线 Chrono-Track */
.chrono-track { position: relative; padding-left: 36px; }
.chrono-track::before {
  content: ''; position: absolute; left: 11px; top: 12px; bottom: 12px; width: 2px;
  background: linear-gradient(180deg, var(--brand-blue) 0%, rgba(15, 23, 42, 0.1) 100%);
}
.chrono-node-epoch { margin-bottom: 36px; position: relative; }
.chrono-epoch-badge {
  font-family: var(--font-mono); font-size: 12px; font-weight: 700;
  background: #FFFFFF; border: 1px solid var(--border-normal); color: var(--brand-blue);
  padding: 4px 14px; border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: 8px;
  margin-left: -36px; margin-bottom: 16px; box-shadow: 0 2px 6px rgba(15,23,42,0.06);
}
.chrono-cards { display: flex; flex-direction: column; gap: 14px; }
.chrono-card {
  background: #FFFFFF; border: 1px solid var(--border-normal);
  border-radius: var(--radius-sm); padding: 18px 22px; cursor: pointer;
  transition: all .2s; position: relative; box-shadow: 0 1px 3px rgba(15,23,42,0.03);
}
.chrono-card:hover {
  border-color: var(--brand-blue); transform: translateX(4px);
  box-shadow: 0 6px 20px rgba(15,23,42,0.06);
}
.chrono-pulse {
  position: absolute; left: -31px; top: 24px; width: 10px; height: 10px;
  border-radius: 50%; background: #FFFFFF; border: 2px solid var(--brand-blue);
}
.chrono-date-badge {
  font-family: var(--font-mono); font-size: 11.5px; font-weight: 700;
  color: #1D4ED8; background: #EFF6FF; border: 1px solid #BFDBFE;
  padding: 2px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;
  flex-shrink: 0;
}
.chrono-meta-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.chrono-heading { font-family: var(--font-display); font-size: 15px; font-weight: 700; color: #0F172A; }
.chrono-body { font-size: 13.5px; color: var(--text-secondary); line-height: 1.6; }

/* 避坑与反思智库 */
.alt-controls { display: flex; gap: 14px; margin-bottom: 24px; align-items: center; flex-wrap: wrap; }
.alt-search-input {
  flex: 1; min-width: 280px; height: 40px; background: #FFFFFF;
  border: 1px solid var(--border-normal); border-radius: var(--radius-sm);
  color: #0F172A; font-family: var(--font-mono); font-size: 13px; padding: 0 16px; outline: none;
  box-shadow: 0 1px 2px rgba(15,23,42,0.03);
}
.alt-search-input:focus { border-color: var(--alert-ruby); box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12); }

.pitfalls-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 18px; }
.pitfall-dossier {
  background: #FFFFFF; border: 1px solid var(--border-normal);
  border-radius: var(--radius-sm); padding: 22px; display: flex; flex-direction: column;
  justify-content: space-between; gap: 14px; cursor: pointer; transition: all .2s;
  box-shadow: 0 1px 3px rgba(15,23,42,0.03);
}
.pitfall-dossier:hover {
  border-color: var(--alert-ruby); transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(220, 38, 38, 0.08);
}
.pitfall-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.pitfall-slug { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hazard-banner {
  background: var(--alert-ruby-subtle); border-left: 3px solid var(--alert-ruby);
  padding: 10px 14px; font-size: 13.5px; font-weight: 600; color: #991B1B;
}
.crux-evidence { font-size: 13px; color: var(--text-secondary); line-height: 1.65; margin-top: 12px; }
.triumphant-verdict {
  background: #ECFDF5; border: 1px solid #A7F3D0;
  border-radius: var(--radius-sm); padding: 8px 12px; font-size: 12px; color: #065F46;
  display: flex; align-items: center; gap: 8px; font-weight: 600;
}

/* 决策档案目录 */
.matrix-toolbar {
  display: flex; align-items: center; gap: 12px; background: #FFFFFF;
  border: 1px solid var(--border-normal); border-radius: var(--radius-sm); padding: 12px 18px; margin-bottom: 16px;
  box-shadow: 0 1px 2px rgba(15,23,42,0.03); flex-wrap: wrap;
}
.matrix-toolbar select {
  height: 34px; background: #F8FAFC; border: 1px solid var(--border-normal);
  border-radius: var(--radius-sm); color: #0F172A; font-family: var(--font-mono); font-size: 12px;
  padding: 0 12px; outline: none; cursor: pointer; font-weight: 500;
}
.matrix-count { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); margin-left: auto; }
.matrix-query-chip {
  font-family: var(--font-mono); font-size: 11px; color: var(--brand-blue); background: #EFF6FF;
  border: 1px solid #BFDBFE; border-radius: 3px; padding: 2px 8px; display: inline-flex; gap: 6px; align-items: center;
}
.matrix-board {
  background: #FFFFFF; border: 1px solid var(--border-normal);
  border-radius: var(--radius-md); overflow: hidden;
  box-shadow: 0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.02);
}
.matrix-row-head, .matrix-row-cell {
  display: grid; grid-template-columns: 80px 110px 1fr 110px 120px 70px;
  gap: 14px; align-items: center; padding: 0 24px;
}
.matrix-row-head {
  height: 42px; background: #F8FAFC; font-family: var(--font-mono);
  font-size: 11.5px; color: var(--text-secondary); border-bottom: 1px solid var(--border-normal);
  font-weight: 600;
}
.matrix-row-cell {
  min-height: 52px; border-bottom: 1px solid #F1F5F9;
  cursor: pointer; transition: all .15s; font-size: 13.5px;
}
.matrix-row-cell:hover { background: #F8FAFC; }
.cell-index { font-family: var(--font-mono); font-size: 12px; color: var(--text-tertiary); font-weight: 500; }
.cell-title { font-weight: 600; color: #0F172A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-date { font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); }
.cell-cites { font-family: var(--font-mono); font-size: 12px; color: var(--brand-blue); text-align: right; font-weight: 700; }

/* 状态与分类徽章 */
.status-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 3px; width: max-content;
}
.status-badge.st-implemented { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }
.status-badge.st-proposed { background: #FFFBEB; color: #92400E; border: 1px solid #FDE68A; }
.status-badge.st-rejected { background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; }
.status-badge.st-archived { background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0; }

.class-badge {
  font-family: var(--font-mono); font-size: 10.5px; padding: 2px 7px;
  border-radius: 3px; font-weight: 600; width: max-content; white-space: nowrap;
  background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0;
}
.cls-architecture { background: #FFF7ED; color: #C2410C; border: 1px solid #FED7AA; }
.cls-feature { background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
.cls-bug-fix { background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; }
.cls-simplification { background: #F0FDFA; color: #0F766E; border: 1px solid #99F6E4; }
.cls-process { background: #FAF5FF; color: #7E22CE; border: 1px solid #E9D5FF; }
.cls-testing { background: #FDF2F8; color: #BE185D; border: 1px solid #FBCFE8; }

.empty-hint {
  color: var(--text-tertiary); font-family: var(--font-mono); font-size: 12px;
  text-align: center; padding: 40px;
}
```

- [ ] **步骤 6：左栏与新增结构样式**

`src/client/styles/shell.css`：

```css
/* 新增结构：左侧项目栏 + 画布容器 + 加载/错误态 */
.shell { display: flex; min-height: calc(100vh - var(--topbar-h)); }
.canvas { flex: 1; min-width: 0; }

.project-rail {
  width: var(--rail-w); flex-shrink: 0;
  position: sticky; top: var(--topbar-h); height: calc(100vh - var(--topbar-h)); overflow-y: auto;
  background: rgba(255, 255, 255, 0.72); border-right: 1px solid var(--border-normal);
  padding: 14px 10px;
}
.rail-label {
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: var(--text-tertiary); padding: 0 6px 8px;
}
.rail-label.section { padding-top: 14px; display: flex; justify-content: space-between; align-items: center; }
.rail-config-error {
  font-family: var(--font-mono); font-size: 10px; color: #991B1B; background: #FEF2F2;
  border: 1px solid #FECACA; border-radius: 4px; padding: 6px 8px; margin-bottom: 10px; line-height: 1.5;
}

.rail-item {
  position: relative; border: 1px solid transparent; border-radius: 6px; padding: 8px 9px; margin-bottom: 3px;
  cursor: pointer; transition: background .15s;
}
.rail-item:hover { background: rgba(241, 245, 249, 0.8); }
.rail-item.active { background: #EFF6FF; border-color: #BFDBFE; box-shadow: inset 2px 0 0 var(--brand-blue); }
.rail-item.unhealthy { opacity: .55; }
.rail-top { display: flex; align-items: center; gap: 7px; }
.rail-dot { width: 7px; height: 7px; border-radius: 2px; flex-shrink: 0; }
.rail-name {
  font-family: var(--font-display); font-size: 12px; font-weight: 600; color: #0F172A;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rail-live { width: 5px; height: 5px; border-radius: 50%; background: var(--emerald-live); margin-left: auto; flex-shrink: 0; }
.rail-meta { font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary); margin-top: 3px; padding-left: 14px; }
.rail-bar { display: flex; gap: 1.5px; margin-top: 5px; margin-left: 14px; height: 3px; }
.rail-bar i { display: block; height: 3px; border-radius: 1px; min-width: 2px; }
.rail-tag {
  display: inline-block; margin: 4px 0 0 14px; font-family: var(--font-mono); font-size: 9.5px; font-weight: 700;
  color: #991B1B; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 3px; padding: 0 5px;
}
.rail-tag.manual { color: #475569; background: #F1F5F9; border-color: var(--border-normal); }

.rail-actions { position: absolute; top: 6px; right: 6px; display: none; gap: 2px; background: inherit; }
.rail-item:hover .rail-actions { display: flex; }
.rail-item:hover .rail-live { visibility: hidden; }
.rail-action {
  border: 1px solid var(--border-normal); background: #FFFFFF; color: var(--text-secondary);
  border-radius: 3px; font-size: 10px; line-height: 1; padding: 3px 4px; cursor: pointer;
}
.rail-action:hover { color: var(--brand-blue); border-color: var(--brand-blue); }

.rail-add {
  width: 100%; border: 1px dashed var(--border-normal); border-radius: 6px; padding: 7px; background: transparent;
  text-align: center; font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary);
  margin-top: 8px; cursor: pointer;
}
.rail-add:hover { color: var(--brand-blue); border-color: var(--brand-blue); }

.skeleton-block {
  height: 120px; border-radius: var(--radius-md); border: 1px solid var(--border-normal);
  background: linear-gradient(90deg, #F1F5F9 25%, #F8FAFC 50%, #F1F5F9 75%);
  background-size: 200% 100%; animation: shimmer 1.2s infinite linear;
}
.skeleton-block.tall { height: 320px; }
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

.state-panel {
  background: #FFFFFF; border: 1px dashed var(--border-normal); border-radius: var(--radius-md);
  padding: 48px 40px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px;
}
.state-panel h2 { font-family: var(--font-display); font-size: 20px; font-weight: 700; }
.state-panel p { color: var(--text-secondary); max-width: 620px; line-height: 1.7; }
.state-panel code { font-family: var(--font-mono); font-size: 12px; background: #F1F5F9; padding: 2px 6px; border-radius: 3px; }
.action-btn-primary {
  background: var(--brand-blue); color: #FFFFFF; border: 0; border-radius: var(--radius-sm);
  padding: 10px 20px; font-family: var(--font-display); font-size: 14px; font-weight: 700; cursor: pointer;
  box-shadow: 0 2px 8px rgba(29, 78, 216, 0.25);
}
.action-btn-primary:hover { background: var(--brand-blue-hover); }

/* 顶栏在较窄窗口下收紧间距，避免右侧信标被挤出 */
@media (max-width: 1400px) {
  .hud-topbar { gap: 14px; padding: 0 20px; }
  .deck-tab { padding: 6px 10px; }
  .hud-search { width: 200px; }
  .hud-search input:focus { width: 260px; }
}
```

- [ ] **步骤 7：抽屉样式**

`src/client/styles/drawer.css`：

```css
/* 详情抽屉：平移自旧看板，新增 verdict / 更新提示条 / 链接三态样式 */
.drawer-curtain {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px); z-index: 60;
}
.drawer-console {
  position: fixed; top: 0; right: 0; bottom: 0; width: 70vw; max-width: 860px; min-width: 520px;
  background: #FFFFFF; border-left: 1px solid var(--border-normal); z-index: 61;
  display: flex; flex-direction: column; box-shadow: -16px 0 48px rgba(15, 23, 42, 0.15);
  animation: drawerIn .28s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes drawerIn { from { transform: translateX(105%); } to { transform: none; } }

.console-header {
  height: 64px; padding: 0 28px; border-bottom: 1px solid var(--border-normal);
  display: flex; align-items: center; gap: 14px; background: #F8FAFC; flex-shrink: 0;
}
.console-exit {
  margin-left: auto;
  background: #FFFFFF; border: 1px solid var(--border-normal); color: var(--text-secondary);
  font-size: 16px; cursor: pointer; padding: 6px 10px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
}
.console-exit:hover { color: #0F172A; border-color: #94A3B8; }

.console-body { flex: 1; overflow-y: auto; padding: 36px 44px 80px; }

.update-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: #FFFBEB; border: 1px solid #FDE68A; color: #92400E; border-radius: var(--radius-sm);
  padding: 10px 14px; margin-bottom: 20px; font-family: var(--font-mono); font-size: 12px; font-weight: 600;
}
.update-banner button {
  background: #FFFFFF; border: 1px solid #FDE68A; color: #92400E; border-radius: 3px;
  padding: 3px 10px; cursor: pointer; font-family: var(--font-mono); font-size: 11px; font-weight: 700;
}
.update-banner.deleted { background: #FEF2F2; border-color: #FECACA; color: #991B1B; }

/* 代码反向注释定位板 */
.anchor-terminal {
  background: #F8FAFC; border: 1px dashed #BFDBFE;
  border-radius: var(--radius-sm); padding: 12px 18px; margin-bottom: 28px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.anchor-code {
  font-family: var(--font-mono); font-size: 12.5px; color: #1D4ED8; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.btn-anchor-copy {
  background: #EFF6FF; border: 1px solid var(--brand-blue);
  color: var(--brand-blue); font-family: var(--font-mono); font-size: 11px; padding: 5px 12px;
  border-radius: var(--radius-sm); cursor: pointer; white-space: nowrap; transition: all .15s;
  font-weight: 600;
}
.btn-anchor-copy:hover { background: var(--brand-blue); color: #FFFFFF; box-shadow: 0 2px 6px rgba(29, 78, 216, 0.2); }

.console-headline {
  font-family: var(--font-display); font-size: 24px; font-weight: 700;
  color: #0F172A; line-height: 1.35; margin-bottom: 16px; letter-spacing: -0.3px;
}
.console-timestamp {
  font-family: var(--font-mono); font-size: 12px; color: var(--text-tertiary);
  display: flex; align-items: center; gap: 10px; margin-bottom: 28px; flex-wrap: wrap;
}
.console-cites { color: var(--brand-blue); font-weight: 700; }

.verdict-banner {
  background: var(--alert-ruby-subtle); border-left: 3px solid var(--alert-ruby);
  padding: 12px 16px; margin-bottom: 28px; color: #991B1B; font-size: 13.5px; line-height: 1.7;
}
.verdict-banner .verdict-label { font-family: var(--font-mono); font-size: 11px; font-weight: 700; display: block; margin-bottom: 4px; }

.quad-section { margin-bottom: 32px; }
.quad-title {
  font-family: var(--font-mono); font-size: 12px; font-weight: 700; letter-spacing: 0.8px;
  color: var(--text-secondary); margin-bottom: 12px; display: flex; align-items: center; gap: 10px;
  text-transform: uppercase;
}
.quad-title::after { content: ''; flex: 1; height: 1px; background: var(--border-normal); }
.quad-placeholder { color: var(--text-tertiary); }

/* Markdown 正文 */
.md-body { font-size: 14.5px; line-height: 1.8; color: #334155; }
.md-body p, .md-body ul, .md-body ol, .md-body blockquote, .md-body pre { margin-bottom: 10px; }
.md-body ul, .md-body ol { padding-left: 22px; }
.md-body h3, .md-body h4, .md-body h5, .md-body h6 {
  font-family: var(--font-display); font-size: 14px; font-weight: 700; color: #0F172A; margin: 16px 0 8px;
}
.md-body blockquote { border-left: 3px solid var(--border-normal); padding-left: 12px; color: var(--text-secondary); }
.md-body code { font-family: var(--font-mono); font-size: 13px; background: #F1F5F9; padding: 2px 6px; border-radius: 3px; color: #1D4ED8; }
.md-body pre { background: #0F172A; border: 1px solid #1E293B; border-radius: var(--radius-sm); padding: 16px; overflow-x: auto; }
.md-body pre code { background: transparent; padding: 0; color: #F8FAFC; white-space: pre; }
.md-link { color: var(--brand-cyan); text-decoration: underline; cursor: pointer; background: none; border: 0; font: inherit; padding: 0; }
.md-link.external { color: var(--text-tertiary); text-decoration: none; cursor: default; }
.md-link.broken { color: var(--alert-ruby); text-decoration: line-through; cursor: default; }

/* 血缘链路 */
.lineage-nodes { display: flex; flex-direction: column; gap: 12px; }
.lineage-group-title { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); margin-bottom: 6px; font-weight: 600; }
.lineage-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.lineage-chip {
  background: #F8FAFC; border: 1px solid var(--border-normal);
  border-radius: var(--radius-sm); padding: 6px 12px; font-size: 12.5px; color: #0F172A;
  cursor: pointer; transition: all .15s; display: inline-flex; align-items: center; gap: 6px;
  font-weight: 500;
}
.lineage-chip:hover { color: var(--brand-blue); border-color: var(--brand-blue); background: #EFF6FF; }
.lineage-chip.external { color: var(--text-tertiary); cursor: default; font-family: var(--font-mono); font-size: 11.5px; }
.lineage-chip.external:hover { color: var(--text-tertiary); border-color: var(--border-normal); background: #F8FAFC; }
.lineage-chip.broken { color: #991B1B; background: #FEF2F2; border-color: #FECACA; cursor: default; font-family: var(--font-mono); font-size: 11.5px; }
.lineage-empty { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }
```

- [ ] **步骤 8：HTML 入口**

`src/client/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>工程决策中心</title>
    <link rel="stylesheet" href="./styles/fonts.css" />
    <link rel="stylesheet" href="./styles/tokens.css" />
    <link rel="stylesheet" href="./styles/app.css" />
    <link rel="stylesheet" href="./styles/shell.css" />
    <link rel="stylesheet" href="./styles/drawer.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **步骤 9：前端入口**

`src/client/main.tsx`：

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **步骤 10：占位 App（任务 23 整体替换）**

`src/client/App.tsx`：

```tsx
export function App() {
  return (
    <header className="hud-topbar">
      <div className="brand-group">
        <div className="brand-logo" />
        <div className="brand-text">工程决策中心</div>
      </div>
    </header>
  );
}
```

- [ ] **步骤 11：启动并冒烟**

```bash
bun run start
```

另开终端：

```bash
curl -s http://127.0.0.1:5173/api/config | head -c 300
curl -s http://127.0.0.1:5173/ | head -c 300
```

预期：控制台打印 `工程决策中心：http://127.0.0.1:5173  （3 个项目，…）`（若 OneDrive 内 `node_modules` 是实体目录，还会多一行 `[onedrive]` 提示）；第一个 curl 返回含 `"projects":[{` 的 JSON；第二个返回带 `<link rel="stylesheet"` 和 `<script type="module"` 的 HTML。浏览器打开能看到带网格背景的白色顶栏和「工程决策中心」字样（Space Grotesk 字体）。Ctrl+C 停止。

- [ ] **步骤 12：类型检查**

```bash
bun run typecheck
```

预期：退出码 0

- [ ] **步骤 13：Commit**

```bash
git add scripts/fetch-fonts.ts src/client/assets/fonts src/client/styles src/client/index.html src/client/main.tsx src/client/App.tsx
git commit -m "feat: 设计令牌、本地字体与前端入口"
```

### 任务 19：前端数据层

实现规格 §6.4：`project-updated` 对当前项目触发后台 refetch，**期间保留旧数据**、到达后原子替换（过期响应丢弃）；对其他项目只用载荷里的 `project` 更新左栏。SSE 重连后 `epoch+1` 触发全量 refetch。不支持 `EventSource` 时降级 30 s 轮询（规格 §7.1）。路由写入用 `replaceState`，不产生历史记录。

**文件：**
- 创建：`src/client/api.ts`
- 创建：`src/client/state/useHub.ts`
- 创建：`src/client/state/useProjectNotes.ts`
- 创建：`src/client/state/useHashRoute.ts`

- [ ] **步骤 1：编写 `api.ts`**

`src/client/api.ts`：

```typescript
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
```

- [ ] **步骤 2：编写 `useHub.ts`**

`src/client/state/useHub.ts`：

```typescript
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
```

- [ ] **步骤 3：编写 `useProjectNotes.ts`**

`src/client/state/useProjectNotes.ts`：

```typescript
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
```

- [ ] **步骤 4：编写 `useHashRoute.ts`**

`src/client/state/useHashRoute.ts`：

```typescript
import { useCallback, useEffect, useState } from 'react';
import { formatHash, parseHash, type ParsedHash, type Route } from '../router';

/** hash 路由：读取用 hashchange，写入用 replaceState（不产生历史记录，后退键不刷屏） */
export function useHashRoute(): [ParsedHash, (route: Route) => void] {
  const [hash, setHash] = useState(() => location.hash);

  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((route: Route) => {
    const next = formatHash(route);
    if (next === location.hash) return;
    history.replaceState(null, '', next);
    setHash(next);
  }, []);

  return [parseHash(hash), navigate];
}
```

- [ ] **步骤 5：类型检查**

```bash
bun run typecheck
```

预期：退出码 0

- [ ] **步骤 6：Commit**

```bash
git add src/client/api.ts src/client/state/useHub.ts src/client/state/useProjectNotes.ts src/client/state/useHashRoute.ts
git commit -m "feat: 前端 API 封装、SSE 状态与 hash 路由 hook"
```

### 任务 20：基础组件

`MarkdownBody` 把正文里的链接按 `rawHref` 对回 `LinkResult`：resolved 可点击打开笔记，external 灰色「↗」，unresolved 红色删除线；仅 http(s) 外链渲染为真正的 `<a>`。`LineageChips` 分四组：前置依据（出链）、派生影响（入链）、外部引用、断链（规格 §4.3 / §6.6）。

**文件：**
- 创建：`src/client/components/Badge.tsx`
- 创建：`src/client/components/MarkdownBody.tsx`
- 创建：`src/client/components/KpiRow.tsx`
- 创建：`src/client/components/LineageChips.tsx`

- [ ] **步骤 1：编写 `Badge.tsx`**

`src/client/components/Badge.tsx`：

```tsx
import type { Lifecycle } from '../../shared/types';
import { classLabel, STATUS_LABELS } from '../labels';

export function StatusBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  return <span className={`status-badge st-${lifecycle}`}>{STATUS_LABELS[lifecycle]}</span>;
}

export function ClassBadge({ cls }: { cls: string }) {
  return <span className={`class-badge cls-${cls}`}>{classLabel(cls)}</span>;
}
```

- [ ] **步骤 2：编写 `MarkdownBody.tsx`**

`src/client/components/MarkdownBody.tsx`：

```tsx
import { useMemo, type ReactNode } from 'react';
import type { LinkResult } from '../../shared/types';
import { parseBlocks, parseInline, type Block, type Inline } from '../markdown';

type LinkContext = { links: readonly LinkResult[]; onOpenNote: (noteId: string) => void };

function renderLink(href: string, children: ReactNode, key: number, ctx: LinkContext): ReactNode {
  const result = ctx.links.find((l) => l.rawHref === href);
  if (result?.kind === 'resolved') {
    return (
      <button key={key} type="button" className="md-link" onClick={() => ctx.onOpenNote(result.targetId)}>
        {children}
      </button>
    );
  }
  if (result?.kind === 'external') {
    return (
      <span key={key} className="md-link external" title={`↗ 外部引用：${href}`}>
        {children} ↗
      </span>
    );
  }
  if (result?.kind === 'unresolved') {
    return (
      <span key={key} className="md-link broken" title={`⚠ 断链：${href}`}>
        {children}
      </span>
    );
  }
  if (/^https?:\/\//i.test(href)) {
    return (
      <a key={key} className="md-link" href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return <span key={key}>{children}</span>;
}

function renderInline(nodes: readonly Inline[], ctx: LinkContext): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.t) {
      case 'text': {
        const lines = node.v.split('\n');
        return lines.flatMap((line, j) => (j === 0 ? [line] : [<br key={`${i}-${j}`} />, line]));
      }
      case 'code':
        return <code key={i}>{node.v}</code>;
      case 'strong':
        return <b key={i}>{renderInline(node.c, ctx)}</b>;
      case 'link':
        return renderLink(node.href, renderInline(node.c, ctx), i, ctx);
    }
  });
}

function renderBlock(block: Block, i: number, ctx: LinkContext): ReactNode {
  switch (block.t) {
    case 'p':
      return <p key={i}>{renderInline(block.c, ctx)}</p>;
    case 'h': {
      const Tag = `h${Math.min(Math.max(block.level, 3), 6)}` as 'h3' | 'h4' | 'h5' | 'h6';
      return <Tag key={i}>{renderInline(block.c, ctx)}</Tag>;
    }
    case 'ul':
    case 'ol': {
      const Tag = block.t;
      return (
        <Tag key={i}>
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item, ctx)}</li>
          ))}
        </Tag>
      );
    }
    case 'quote':
      return <blockquote key={i}>{renderInline(block.c, ctx)}</blockquote>;
    case 'pre':
      return (
        <pre key={i}>
          <code>{block.v}</code>
        </pre>
      );
  }
}

export type MarkdownBodyProps = {
  source: string;
  links: readonly LinkResult[];
  onOpenNote: (noteId: string) => void;
  /** 单行模式：只解析行内语法（用于 verdict） */
  inline?: boolean;
};

export function MarkdownBody({ source, links, onOpenNote, inline = false }: MarkdownBodyProps) {
  const ctx = { links, onOpenNote };
  const blocks = useMemo(() => (inline ? null : parseBlocks(source)), [source, inline]);
  if (inline) return <span className="md-body">{renderInline(parseInline(source), ctx)}</span>;
  return <div className="md-body">{blocks!.map((b, i) => renderBlock(b, i, ctx))}</div>;
}
```

- [ ] **步骤 3：编写 `KpiRow.tsx`**

`src/client/components/KpiRow.tsx`：

```tsx
import type { NoteSummary } from '../../shared/types';
import { computeKpis, type KpiTarget } from '../derive';

export function KpiRow({ notes, onJump }: { notes: readonly NoteSummary[]; onJump: (target: KpiTarget) => void }) {
  return (
    <div className="kpi-row">
      {computeKpis(notes).map((k) => (
        <button key={k.key} type="button" className="kpi-instrument" onClick={() => onJump(k.target)}>
          <div className="kpi-tag">
            <span>{k.label}</span>
            <span className="kpi-dot" style={{ background: k.color }} />
          </div>
          <div className="kpi-num">{k.count}</div>
          <div className="kpi-caption">{k.caption}</div>
          <div className="kpi-accent-bar" style={{ background: k.color }} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **步骤 4：编写 `LineageChips.tsx`**

`src/client/components/LineageChips.tsx`：

```tsx
import type { NoteDoc, NoteSummary } from '../../shared/types';
import { incoming } from '../derive';

export function LineageChips({
  note,
  notes,
  onOpenNote,
}: {
  note: NoteDoc;
  notes: readonly NoteSummary[];
  onOpenNote: (noteId: string) => void;
}) {
  const titleOf = (id: string) => notes.find((n) => n.id === id)?.title ?? id;
  const outgoing = note.links.filter((l) => l.kind === 'resolved');
  const external = note.links.filter((l) => l.kind === 'external');
  const broken = note.links.filter((l) => l.kind === 'unresolved');
  const inbound = incoming(notes, note.id);

  if (!outgoing.length && !external.length && !broken.length && !inbound.length) {
    return <span className="lineage-empty">独立节点，暂无交叉引用</span>;
  }

  return (
    <div className="lineage-nodes">
      {outgoing.length > 0 && (
        <div>
          <div className="lineage-group-title">前置先决依据：</div>
          <div className="lineage-chips">
            {outgoing.map((l) => (
              <button key={l.rawHref} type="button" className="lineage-chip" onClick={() => onOpenNote(l.targetId)}>
                ↖ {titleOf(l.targetId)}
              </button>
            ))}
          </div>
        </div>
      )}
      {inbound.length > 0 && (
        <div>
          <div className="lineage-group-title">派生制约影响：</div>
          <div className="lineage-chips">
            {inbound.map((n) => (
              <button key={n.id} type="button" className="lineage-chip" onClick={() => onOpenNote(n.id)}>
                ↘ {n.title}
              </button>
            ))}
          </div>
        </div>
      )}
      {external.length > 0 && (
        <div>
          <div className="lineage-group-title">外部引用（notes 目录之外）：</div>
          <div className="lineage-chips">
            {external.map((l) => (
              <span key={l.rawHref} className="lineage-chip external" title={l.rawHref}>
                ↗ 外部引用 · {l.rawHref}
              </span>
            ))}
          </div>
        </div>
      )}
      {broken.length > 0 && (
        <div>
          <div className="lineage-group-title">断链（目标笔记不存在）：</div>
          <div className="lineage-chips">
            {broken.map((l) => (
              <span key={l.rawHref} className="lineage-chip broken" title={l.rawHref}>
                ⚠ 断链 · {l.rawHref}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **步骤 5：类型检查**

```bash
bun run typecheck
```

预期：退出码 0

- [ ] **步骤 6：Commit**

```bash
git add src/client/components/Badge.tsx src/client/components/MarkdownBody.tsx src/client/components/KpiRow.tsx src/client/components/LineageChips.tsx
git commit -m "feat: 徽章、Markdown 渲染、KPI 与血缘组件"
```

### 任务 21：顶栏、搜索与项目栏

搜索：`/` 聚焦（焦点在其他输入框时不抢），↑↓ 选择，↵ 打开选中项或跳到决策清单，Esc 关闭，浮层前 7 条。信标三态：连接中 / 重连中（琥珀）、当前项目手动刷新模式（灰，可点击重扫）、N 个项目监听中（绿）。项目栏按 `lastChangeAt` 倒序，条目含色点、名称、实时绿点、条数 · 新鲜度、四色占比条、失效 / 手动刷新标签；悬停出现 ↻ / ✎ / 隐 / ✕（✕ 仅手动项目），底部「已隐藏 N」可展开。

**文件：**
- 创建：`src/client/components/SearchPopover.tsx`
- 创建：`src/client/components/TopBar.tsx`
- 创建：`src/client/components/ProjectRail.tsx`

- [ ] **步骤 1：编写 `SearchPopover.tsx`**

`src/client/components/SearchPopover.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react';
import type { NoteSummary } from '../../shared/types';
import { cites, searchNotes, type InCount } from '../derive';
import { ClassBadge } from './Badge';

export type SearchBoxProps = {
  notes: readonly NoteSummary[];
  inCount: InCount;
  query: string;
  onQueryChange: (q: string) => void;
  onOpenNote: (noteId: string) => void;
  /** 回车且未选中条目：去决策清单查看全部匹配 */
  onShowAll: () => void;
};

/** 顶栏全局搜索：/ 聚焦，↑↓ 选择，↵ 打开，Esc 关闭，浮层显示前 7 条 */
export function SearchBox({ notes, inCount, query, onQueryChange, onOpenNote, onShowAll }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const { total, top } = searchNotes(notes, query);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || document.activeElement === inputRef.current) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const pick = (noteId: string) => {
    onOpenNote(noteId);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!top.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setSelected((i) => (i + step + top.length) % top.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = top[selected];
      if (hit) pick(hit.id);
      else {
        onShowAll();
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="hud-search" ref={boxRef}>
      <svg className="search-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        placeholder="快速搜索决策与避坑..."
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setSelected(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <span className="shortcut-key">/</span>
      {open && query.trim() && (
        <div className="search-popover">
          {top.length === 0 ? (
            <div className="popover-empty">// 未找到与 "{query}" 匹配的决策记录</div>
          ) : (
            <>
              {top.map((n, i) => (
                <div
                  key={n.id}
                  className={`popover-item${i === selected ? ' selected' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(n.id)}
                >
                  <div className="popover-item-main">
                    <div className="popover-title">{n.title}</div>
                    <div className="popover-sub">
                      <ClassBadge cls={n.cls} />
                      <span>{n.date || '进行中'}</span>
                      <span>#{n.slug}</span>
                    </div>
                  </div>
                  {cites(inCount, n.id) > 0 && <span className="weight-gauge">↗{cites(inCount, n.id)}</span>}
                </div>
              ))}
              <div className="popover-footer">
                <span>
                  共找到 <b>{total}</b> 项决策
                </span>
                <span>按 ↵ 回车在全量清单中查看全部</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **步骤 2：编写 `TopBar.tsx`**

`src/client/components/TopBar.tsx`：

```tsx
import type { ProjectMeta } from '../../shared/types';
import { VIEW_LABELS, VIEWS, type ViewId } from '../router';
import type { SyncStatus } from '../state/useHub';
import { SearchBox, type SearchBoxProps } from './SearchPopover';

export type TopBarProps = {
  project: ProjectMeta | null;
  projects: readonly ProjectMeta[];
  view: ViewId;
  status: SyncStatus;
  onViewChange: (view: ViewId) => void;
  onRescan: (projectId: string) => void;
  search: SearchBoxProps;
};

function Beacon({ project, projects, status, onRescan }: Pick<TopBarProps, 'project' | 'projects' | 'status' | 'onRescan'>) {
  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <div className="sync-beacon">
        <span className="radar-dot syncing" />
        {status === 'connecting' ? '连接中…' : '连接断开，重连中…'}
      </div>
    );
  }
  if (project && project.watchMode === 'manual') {
    return (
      <button type="button" className="sync-beacon" title="该项目无法实时监听，点击手动刷新" onClick={() => onRescan(project.id)}>
        <span className="radar-dot" />
        手动刷新模式 · 点击刷新
      </button>
    );
  }
  const live = projects.filter((p) => p.watchMode === 'live' && p.healthy).length;
  return (
    <div className="sync-beacon">
      <span className={`radar-dot ${status === 'polling' ? 'syncing' : 'active'}`} />
      {status === 'polling' ? '轮询同步（30 s）' : `${live} 个项目监听中`}
    </div>
  );
}

export function TopBar(props: TopBarProps) {
  const { project, view, onViewChange, search } = props;
  return (
    <header className="hud-topbar">
      <div className="brand-group">
        <div className="brand-logo" />
        <div className="brand-text">
          <span>工程决策中心</span>
          {project && (
            <span className="telemetry-chip">
              {project.displayName} · {project.count} 条
            </span>
          )}
        </div>
      </div>
      <nav className="deck-tabs">
        {VIEWS.map((v) => (
          <button key={v} type="button" className={`deck-tab${v === view ? ' active' : ''}`} onClick={() => onViewChange(v)}>
            {VIEW_LABELS[v]}
          </button>
        ))}
      </nav>
      <div className="hud-grow" />
      <SearchBox {...search} />
      <Beacon {...props} />
    </header>
  );
}
```

- [ ] **步骤 3：编写 `ProjectRail.tsx`**

`src/client/components/ProjectRail.tsx`：

```tsx
import { useState } from 'react';
import { LIFECYCLES, type ProjectMeta } from '../../shared/types';
import { relativeTime } from '../format';
import { LIFECYCLE_COLORS, projectColor } from '../labels';

export type ProjectActions = {
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (project: ProjectMeta) => void;
  onToggleHidden: (project: ProjectMeta) => void;
  onRemove: (project: ProjectMeta) => void;
  onRescan: (project: ProjectMeta) => void;
};

/** 左栏排序：最近变动在前，同时间按发现顺序 */
export function sortProjects(projects: readonly ProjectMeta[]): ProjectMeta[] {
  return [...projects].sort((a, b) => b.lastChangeAt - a.lastChangeAt || a.order - b.order);
}

function RailItem({ project, active, actions }: { project: ProjectMeta; active: boolean; actions: ProjectActions }) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const classes = ['rail-item', active ? 'active' : '', project.healthy ? '' : 'unhealthy'].filter(Boolean).join(' ');
  return (
    <div className={classes} onClick={() => actions.onSelect(project.id)} title={project.path}>
      <div className="rail-top">
        <span className="rail-dot" style={{ background: projectColor(project.order) }} />
        <span className="rail-name">{project.displayName}</span>
        {project.healthy && project.watchMode === 'live' && <span className="rail-live" title="实时监听中" />}
      </div>
      <div className="rail-meta">
        {project.count} 条 · {relativeTime(project.lastChangeAt)}
      </div>
      {project.count > 0 && (
        <div className="rail-bar">
          {LIFECYCLES.filter((l) => project.counts[l] > 0).map((l) => (
            <i key={l} style={{ background: LIFECYCLE_COLORS[l], flexGrow: project.counts[l] }} />
          ))}
        </div>
      )}
      {!project.healthy && <span className="rail-tag">路径失效</span>}
      {project.healthy && project.watchMode === 'manual' && <span className="rail-tag manual">手动刷新</span>}
      <div className="rail-actions">
        {project.watchMode === 'manual' && (
          <button type="button" className="rail-action" title="重新扫描" onClick={stop(() => actions.onRescan(project))}>
            ↻
          </button>
        )}
        <button type="button" className="rail-action" title="重命名" onClick={stop(() => actions.onRename(project))}>
          ✎
        </button>
        <button type="button" className="rail-action" title={project.hidden ? '取消隐藏' : '隐藏'} onClick={stop(() => actions.onToggleHidden(project))}>
          {project.hidden ? '显' : '隐'}
        </button>
        {project.source === 'manual' && (
          <button type="button" className="rail-action" title="移除" onClick={stop(() => actions.onRemove(project))}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export function ProjectRail({
  projects,
  activeId,
  configError,
  actions,
}: {
  projects: readonly ProjectMeta[];
  activeId: string | null;
  configError: string | null;
  actions: ProjectActions;
}) {
  const [showHidden, setShowHidden] = useState(false);
  const sorted = sortProjects(projects);
  const visible = sorted.filter((p) => !p.hidden);
  const hidden = sorted.filter((p) => p.hidden);
  return (
    <aside className="project-rail">
      {configError && <div className="rail-config-error">{configError}</div>}
      <div className="rail-label">项目 {visible.length}</div>
      {visible.map((p) => (
        <RailItem key={p.id} project={p} active={p.id === activeId} actions={actions} />
      ))}
      <button type="button" className="rail-add" onClick={actions.onAdd}>
        + 添加项目路径
      </button>
      {hidden.length > 0 && (
        <>
          <div className="rail-label section">
            <span>已隐藏 {hidden.length}</span>
            <button type="button" className="link-btn" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? '收起' : '展开'}
            </button>
          </div>
          {showHidden && hidden.map((p) => <RailItem key={p.id} project={p} active={p.id === activeId} actions={actions} />)}
        </>
      )}
    </aside>
  );
}
```

- [ ] **步骤 4：类型检查**

```bash
bun run typecheck
```

预期：退出码 0

- [ ] **步骤 5：Commit**

```bash
git add src/client/components/SearchPopover.tsx src/client/components/TopBar.tsx src/client/components/ProjectRail.tsx
git commit -m "feat: 顶栏、全局搜索浮层与左侧项目栏"
```

### 任务 22：四个视图与项目画布

`Workspace` 持有筛选 reducer，App 以项目 id 作 `key` 渲染它：**切项目整组件重建 → 筛选重置；切视图只换子视图 → 筛选保留**（规格 §6.3，修正旧版筛选粘连）。顶栏全局搜索词同时过滤决策清单；避坑智库用自己的独立搜索框（规格 §6.5）。

**文件：**
- 创建：`src/client/views/BaselineView.tsx`
- 创建：`src/client/views/TimelineView.tsx`
- 创建：`src/client/views/AlternativesView.tsx`
- 创建：`src/client/views/DirectoryView.tsx`
- 创建：`src/client/views/Workspace.tsx`

- [ ] **步骤 1：编写 `BaselineView.tsx`**

`src/client/views/BaselineView.tsx`：

```tsx
import type { NoteSummary } from '../../shared/types';
import { ClassBadge } from '../components/Badge';
import { KpiRow } from '../components/KpiRow';
import { chambers, cites, pillarAbstract, pillars, type InCount, type KpiTarget } from '../derive';
import { classLabel } from '../labels';

export type BaselineViewProps = {
  notes: readonly NoteSummary[];
  inCount: InCount;
  onOpenNote: (noteId: string) => void;
  onJump: (target: KpiTarget) => void;
};

export function BaselineView({ notes, inCount, onOpenNote, onJump }: BaselineViewProps) {
  return (
    <section className="canvas-view">
      <KpiRow notes={notes} onJump={onJump} />

      <div className="hud-panel" style={{ marginBottom: 28 }}>
        <div className="panel-masthead">
          <span className="panel-headline">
            <span>🏛️</span>
            <span>系统承重墙</span>
          </span>
          <span className="panel-annotation">基于交叉引用入度权重萃取的系统关键协议</span>
        </div>
        <div className="pillars-vault">
          {pillars(notes, inCount).map((n) => (
            <div key={n.id} className="pillar-specimen" onClick={() => onOpenNote(n.id)}>
              <div>
                <div className="pillar-meta">
                  <ClassBadge cls={n.cls} />
                  <span className="weight-gauge">被引用 × {cites(inCount, n.id)}</span>
                </div>
                <div className="pillar-core-title">{n.title}</div>
                <div className="pillar-abstract">{pillarAbstract(n)}</div>
              </div>
              <div className="pillar-telemetry">
                <span>{n.date || '进行中'}</span>
                <span>#{n.slug}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hud-panel">
        <div className="panel-masthead">
          <span className="panel-headline">
            <span>🧩</span>
            <span>领域架构分类阵列</span>
          </span>
          <span className="panel-annotation">现行生效的生产事实全景清单</span>
        </div>
        <div className="matrix-chambers">
          {chambers(notes).map(({ cls, notes: col }) => (
            <div key={cls} className="chamber-pod">
              <div className="chamber-header">
                <span className="chamber-name">{classLabel(cls)}</span>
                <span className="chamber-count">{col.length}</span>
              </div>
              <div className="chamber-stream">
                {col.length === 0 && <div className="chamber-empty">// 暂无该类活跃决策</div>}
                {col.map((n) => (
                  <div key={n.id} className="specimen-row" onClick={() => onOpenNote(n.id)}>
                    <div className="specimen-title">{n.title}</div>
                    <div className="specimen-info">
                      <span>{n.date || '—'}</span>
                      {cites(inCount, n.id) > 0 && <span className="specimen-cites">↗{cites(inCount, n.id)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **步骤 2：编写 `TimelineView.tsx`**

`src/client/views/TimelineView.tsx`：

```tsx
import type { Dispatch } from 'react';
import type { NoteSummary } from '../../shared/types';
import { ClassBadge, StatusBadge } from '../components/Badge';
import { timeline } from '../derive';
import { plainText } from '../format';
import { classLabel } from '../labels';
import type { FilterAction, Filters } from '../state/filters';

export type TimelineViewProps = {
  notes: readonly NoteSummary[];
  filters: Filters;
  dispatch: Dispatch<FilterAction>;
  onOpenNote: (noteId: string) => void;
};

export function TimelineView({ notes, filters, dispatch, onOpenNote }: TimelineViewProps) {
  const { timelineMonth: month, timelineClass: cls } = filters;
  const data = timeline(notes, month, cls);
  const slices = [month, cls ? classLabel(cls) : ''].filter(Boolean);

  return (
    <section className="canvas-view">
      <div className="hud-panel">
        <div className="panel-masthead">
          <span className="panel-headline">
            <span>⏱️</span>
            <span>技术演进时间线</span>
          </span>
          <span className="panel-annotation">记录架构突破与代码裁撤里程碑</span>
        </div>

        <div className="timeline-toolbar">
          <div className="filter-row">
            <span className="filter-group-label">📅 月份切片:</span>
            <div className="month-pills">
              <button type="button" className={`month-pill${!month ? ' active' : ''}`} onClick={() => dispatch({ type: 'set', patch: { timelineMonth: '' } })}>
                全部 ({data.total})
              </button>
              {data.months.map((m) => (
                <button
                  key={m.month}
                  type="button"
                  className={`month-pill${month === m.month ? ' active' : ''}`}
                  onClick={() => dispatch({ type: 'set', patch: { timelineMonth: m.month } })}
                >
                  {m.month} ({m.count})
                </button>
              ))}
            </div>
          </div>
          <div className="filter-row">
            <span className="filter-group-label">🏷️ 分类切片:</span>
            <div className="class-pills">
              <button type="button" className={`class-pill${!cls ? ' active' : ''}`} onClick={() => dispatch({ type: 'set', patch: { timelineClass: '' } })}>
                全部分类 ({data.total})
              </button>
              {data.classCounts.map((c) => (
                <button
                  key={c.cls}
                  type="button"
                  className={`class-pill${cls === c.cls ? ' active' : ''}`}
                  onClick={() => dispatch({ type: 'set', patch: { timelineClass: c.cls } })}
                >
                  {classLabel(c.cls)} ({c.count})
                </button>
              ))}
            </div>
          </div>
          <div className="filter-summary-bar">
            <span>
              {slices.length
                ? `已切片 [${slices.join(' · ')}] 对应 ${data.filtered.length} 条记录`
                : `全周期全分类共 ${data.filtered.length} 条演化记录`}
            </span>
            <button type="button" className="link-btn" onClick={() => dispatch({ type: 'reset-timeline' })}>
              重置时间线筛选
            </button>
          </div>
        </div>

        <div className="chrono-track">
          {data.groups.length === 0 && <div className="empty-hint">// 未找到符合此切片组合的演化记录</div>}
          {data.groups.map((g) => (
            <div key={g.month} className="chrono-node-epoch">
              <div className="chrono-epoch-badge">
                {g.month} · {g.notes.length} 条
              </div>
              <div className="chrono-cards">
                {g.notes.map((n) => (
                  <div key={n.id} className="chrono-card" onClick={() => onOpenNote(n.id)}>
                    <div className="chrono-pulse" />
                    <div className="chrono-meta-row">
                      <span className="chrono-date-badge">📅 {n.date}</span>
                      <ClassBadge cls={n.cls} />
                      <StatusBadge lifecycle={n.lifecycle} />
                      <span className="chrono-heading">{n.title}</span>
                    </div>
                    <div className="chrono-body">{plainText(n.problem || n.decision).slice(0, 180)}…</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **步骤 3：编写 `AlternativesView.tsx`**

`src/client/views/AlternativesView.tsx`：

```tsx
import type { Dispatch } from 'react';
import type { NoteSummary } from '../../shared/types';
import { ClassBadge } from '../components/Badge';
import { pitfalls } from '../derive';
import type { FilterAction } from '../state/filters';

export type AlternativesViewProps = {
  notes: readonly NoteSummary[];
  query: string;
  dispatch: Dispatch<FilterAction>;
  onOpenNote: (noteId: string) => void;
};

export function AlternativesView({ notes, query, dispatch, onOpenNote }: AlternativesViewProps) {
  const items = pitfalls(notes, query);
  return (
    <section className="canvas-view">
      <div className="hud-panel">
        <div className="panel-masthead">
          <span className="panel-headline">
            <span>🛡️</span>
            <span>避坑与反思智库</span>
          </span>
          <span className="panel-annotation">记录「为什么放弃了方案 B」与被否决的提案，防止重复踩坑</span>
        </div>
        <div className="alt-controls">
          <input
            type="text"
            className="alt-search-input"
            placeholder="检索被否决方案关键字（如：SQLite、多进程、Redis...）"
            value={query}
            onChange={(e) => dispatch({ type: 'set', patch: { altQuery: e.target.value } })}
          />
        </div>
        <div className="pitfalls-grid">
          {items.length === 0 && <div className="empty-hint" style={{ gridColumn: '1 / -1' }}>// 未检索到相关避坑记录</div>}
          {items.map((it) => (
            <div key={it.key} className="pitfall-dossier" onClick={() => onOpenNote(it.noteId)}>
              <div>
                <div className="pitfall-head">
                  <ClassBadge cls={it.cls} />
                  <span className="pitfall-slug">#{it.slug}</span>
                </div>
                <div className="hazard-banner">🚫 放弃备选：{it.discarded}</div>
                <div className="crux-evidence">💡 权衡依据：{it.crux}</div>
              </div>
              <div className="triumphant-verdict">✅ {it.winner}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **步骤 4：编写 `DirectoryView.tsx`**

`src/client/views/DirectoryView.tsx`：

```tsx
import type { Dispatch } from 'react';
import { LIFECYCLES, type Lifecycle, type NoteSummary } from '../../shared/types';
import { ClassBadge, StatusBadge } from '../components/Badge';
import { cites, classesOf, directory, type InCount, type SortMode } from '../derive';
import { classLabel, STATUS_LABELS } from '../labels';
import type { FilterAction, Filters } from '../state/filters';

export type DirectoryViewProps = {
  notes: readonly NoteSummary[];
  inCount: InCount;
  filters: Filters;
  dispatch: Dispatch<FilterAction>;
  /** 顶栏全局搜索词，同时作为清单的关键字过滤 */
  query: string;
  onClearQuery: () => void;
  onOpenNote: (noteId: string) => void;
};

export function DirectoryView({ notes, inCount, filters, dispatch, query, onClearQuery, onOpenNote }: DirectoryViewProps) {
  const list = directory(notes, inCount, { status: filters.status, cls: filters.cls, sort: filters.sort, query });
  return (
    <section className="canvas-view">
      <div className="matrix-toolbar">
        <select value={filters.status} onChange={(e) => dispatch({ type: 'set', patch: { status: e.target.value as Lifecycle | '' } })}>
          <option value="">状态：全部</option>
          {LIFECYCLES.map((s) => (
            <option key={s} value={s}>
              状态：{STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={filters.cls} onChange={(e) => dispatch({ type: 'set', patch: { cls: e.target.value } })}>
          <option value="">分类：全部</option>
          {classesOf(notes).map((c) => (
            <option key={c} value={c}>
              分类：{classLabel(c)}
            </option>
          ))}
        </select>
        <select value={filters.sort} onChange={(e) => dispatch({ type: 'set', patch: { sort: e.target.value as SortMode } })}>
          <option value="new">排序：最新优先</option>
          <option value="old">排序：最早优先</option>
          <option value="cites">排序：引用最多</option>
        </select>
        <button
          type="button"
          className="link-btn"
          title="清空全部筛选条件"
          onClick={() => {
            dispatch({ type: 'reset-directory' });
            onClearQuery();
          }}
        >
          重置筛选
        </button>
        {query.trim() && (
          <span className="matrix-query-chip">
            关键字：{query.trim()}
            <button type="button" className="link-btn" onClick={onClearQuery}>
              ✕
            </button>
          </span>
        )}
        <span className="matrix-count">匹配 {list.length} 条</span>
      </div>

      <div className="matrix-board">
        <div className="matrix-row-head">
          <span>编号</span>
          <span>分类</span>
          <span>标题</span>
          <span>状态</span>
          <span>日期</span>
          <span style={{ textAlign: 'right' }}>引用</span>
        </div>
        {list.length === 0 && <div className="empty-hint">// 没有匹配的决策记录</div>}
        {list.map((n, i) => (
          <div key={n.id} className="matrix-row-cell" onClick={() => onOpenNote(n.id)}>
            <span className="cell-index">#{String(i + 1).padStart(3, '0')}</span>
            <span>
              <ClassBadge cls={n.cls} />
            </span>
            <span className="cell-title">{n.title}</span>
            <span>
              <StatusBadge lifecycle={n.lifecycle} />
            </span>
            <span className="cell-date">{n.date || '—'}</span>
            <span className="cell-cites">{cites(inCount, n.id) > 0 ? `↗ ${cites(inCount, n.id)}` : ''}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **步骤 5：编写 `Workspace.tsx`**

`src/client/views/Workspace.tsx`：

```tsx
import { useReducer } from 'react';
import type { NotesResponse, ProjectMeta } from '../../shared/types';
import type { KpiTarget } from '../derive';
import type { ViewId } from '../router';
import { filtersReducer, INITIAL_FILTERS } from '../state/filters';
import { AlternativesView } from './AlternativesView';
import { BaselineView } from './BaselineView';
import { DirectoryView } from './DirectoryView';
import { TimelineView } from './TimelineView';

export type WorkspaceProps = {
  project: ProjectMeta;
  data: NotesResponse | null;
  error: string | null;
  view: ViewId;
  query: string;
  onClearQuery: () => void;
  onViewChange: (view: ViewId) => void;
  onOpenNote: (noteId: string) => void;
  onRescan: () => void;
};

/**
 * 单个项目的画布。父组件以项目 id 作 key：切项目时整个组件重建，筛选状态随之重置；
 * 切视图只换子视图，筛选保留。
 */
export function Workspace({ project, data, error, view, query, onClearQuery, onViewChange, onOpenNote, onRescan }: WorkspaceProps) {
  const [filters, dispatch] = useReducer(filtersReducer, INITIAL_FILTERS);

  if (!project.healthy) {
    return (
      <div className="state-panel">
        <h2>项目路径失效</h2>
        <p>
          找不到 <code>{project.path}\.agents\notes</code>。{project.error}
        </p>
        <button type="button" className="action-btn-primary" onClick={onRescan}>
          重新扫描
        </button>
      </div>
    );
  }
  if (!data) {
    return error ? (
      <div className="state-panel">
        <h2>加载失败</h2>
        <p>{error}</p>
      </div>
    ) : (
      <>
        <div className="skeleton-block" />
        <div className="skeleton-block tall" />
      </>
    );
  }
  if (data.notes.length === 0) {
    return (
      <div className="state-panel">
        <h2>{project.displayName} 暂无决策笔记</h2>
        <p>
          在 <code>.agents/notes/&lt;lifecycle&gt;/&lt;class&gt;/</code> 下新建笔记后，这里会自动出现。
        </p>
      </div>
    );
  }

  const { notes, inCount } = data;
  const jump = (target: KpiTarget) => {
    dispatch({ type: 'jump', target });
    onClearQuery();
    onViewChange('directory');
  };

  switch (view) {
    case 'baseline':
      return <BaselineView notes={notes} inCount={inCount} onOpenNote={onOpenNote} onJump={jump} />;
    case 'timeline':
      return <TimelineView notes={notes} filters={filters} dispatch={dispatch} onOpenNote={onOpenNote} />;
    case 'alternatives':
      return <AlternativesView notes={notes} query={filters.altQuery} dispatch={dispatch} onOpenNote={onOpenNote} />;
    case 'directory':
      return (
        <DirectoryView
          notes={notes}
          inCount={inCount}
          filters={filters}
          dispatch={dispatch}
          query={query}
          onClearQuery={onClearQuery}
          onOpenNote={onOpenNote}
        />
      );
  }
}
```

- [ ] **步骤 6：类型检查**

```bash
bun run typecheck
```

预期：退出码 0

- [ ] **步骤 7：Commit**

```bash
git add src/client/views/BaselineView.tsx src/client/views/TimelineView.tsx src/client/views/AlternativesView.tsx src/client/views/DirectoryView.tsx src/client/views/Workspace.tsx
git commit -m "feat: 架构基线 / 时间线 / 避坑智库 / 决策清单视图"
```

### 任务 23：详情抽屉与完整 App

抽屉打开时拉一次 `/api/projects/:id/notes/:noteId` 作快照；之后该篇被改动（列表里的 `hash` 与快照不同）只浮出「此笔记已更新 · 点击刷新」，不替换正文；被删除则提示并保留删除前内容（规格 §6.4）。verdict 在顶部单独显示，四段之后渲染 `extraSections`，最后是血缘链路。

**文件：**
- 创建：`src/client/components/NoteDrawer.tsx`
- 修改：`src/client/App.tsx`（整体替换任务 18 的占位）

- [ ] **步骤 1：编写 `NoteDrawer.tsx`**

`src/client/components/NoteDrawer.tsx`：

```tsx
import { useEffect, useState } from 'react';
import type { NoteDoc, NoteSummary } from '../../shared/types';
import { api } from '../api';
import { cites, findNote, type InCount } from '../derive';
import { ClassBadge, StatusBadge } from './Badge';
import { LineageChips } from './LineageChips';
import { MarkdownBody } from './MarkdownBody';

export type NoteDrawerProps = {
  projectId: string;
  /** 路由里的笔记键：id 或 slug */
  noteKey: string;
  /** 当前项目的最新笔记列表；null 表示尚未加载 */
  notes: readonly NoteSummary[] | null;
  inCount: InCount;
  onClose: () => void;
  onOpenNote: (noteId: string) => void;
};

const QUADS = [
  { key: 'problem', title: '🎯 01. 背景与痛点', empty: '（未独立分节说明问题）' },
  { key: 'decision', title: '⚡ 02. 落地裁定事实', empty: '（未记录具体裁定事实）' },
  { key: 'alternatives', title: '🚫 03. 审慎考虑并放弃的备选', empty: '（无曾考虑的备选对比）' },
  { key: 'consequences', title: '⚖️ 04. 收益与工程代价', empty: '（未详述工程后果）' },
] as const;

function CopyAnchor({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const anchor = `// Note: 见 .agents/notes/${id}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(anchor);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('[drawer] 复制失败', err);
    }
  };
  return (
    <div className="anchor-terminal">
      <span className="anchor-code">{anchor}</span>
      <button type="button" className="btn-anchor-copy" onClick={copy}>
        {copied ? '已复制' : '复制反向代码注释'}
      </button>
    </div>
  );
}

function DrawerBody({ doc, notes, inCount, onOpenNote }: { doc: NoteDoc; notes: readonly NoteSummary[]; inCount: InCount; onOpenNote: (id: string) => void }) {
  const citeCount = cites(inCount, doc.id);
  return (
    <>
      <CopyAnchor id={doc.id} />
      <h1 className="console-headline">{doc.title}</h1>
      <div className="console-timestamp">
        <span>{doc.date || '无日期'}</span>
        <span>·</span>
        <span>{doc.slug}</span>
        {citeCount > 0 && (
          <>
            <span>·</span>
            <span className="console-cites">被引用 {citeCount} 次</span>
          </>
        )}
      </div>
      {doc.verdict && (
        <div className="verdict-banner">
          <span className="verdict-label">否决 / 状态说明</span>
          <MarkdownBody source={doc.verdict} links={doc.links} onOpenNote={onOpenNote} inline />
        </div>
      )}
      {QUADS.map((q) => (
        <div className="quad-section" key={q.key}>
          <div className="quad-title">{q.title}</div>
          {doc[q.key] ? (
            <MarkdownBody source={doc[q.key]} links={doc.links} onOpenNote={onOpenNote} />
          ) : (
            <div className="md-body quad-placeholder">{q.empty}</div>
          )}
        </div>
      ))}
      {doc.extraSections.map((s, i) => (
        <div className="quad-section" key={`${s.heading}-${i}`}>
          <div className="quad-title">📎 {s.heading}</div>
          <MarkdownBody source={s.body} links={doc.links} onOpenNote={onOpenNote} />
        </div>
      ))}
      <div className="quad-section">
        <div className="quad-title">🔗 05. 因果与血缘依赖链路</div>
        <LineageChips note={doc} notes={notes} onOpenNote={onOpenNote} />
      </div>
    </>
  );
}

/**
 * 详情抽屉。打开时拉取一次完整内容作为快照；之后笔记被改动不自动替换正文，
 * 而是浮出「此笔记已更新 · 点击刷新」，由用户决定何时刷新。父组件以 noteKey 作 key，换篇即重置。
 */
export function NoteDrawer({ projectId, noteKey, notes, inCount, onClose, onOpenNote }: NoteDrawerProps) {
  const summary = notes ? findNote(notes, noteKey) : undefined;
  const noteId = summary?.id ?? null;
  const [snapshot, setSnapshot] = useState<NoteDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    api
      .note(projectId, noteId)
      .then((res) => {
        if (cancelled) return;
        setSnapshot(res.note);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, noteId, reloadTick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stale = !!(summary && snapshot && summary.hash !== snapshot.hash);
  const deleted = !!(notes && !summary && snapshot);
  const missing = !!(notes && !summary && !snapshot);

  return (
    <>
      <div className="drawer-curtain" onClick={onClose} />
      <aside className="drawer-console">
        <div className="console-header">
          {snapshot && <StatusBadge lifecycle={snapshot.lifecycle} />}
          {snapshot && <ClassBadge cls={snapshot.cls} />}
          <button type="button" className="console-exit" title="退出 (Esc)" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="console-body">
          {stale && (
            <div className="update-banner">
              <span>此笔记已更新</span>
              <button type="button" onClick={() => setReloadTick((t) => t + 1)}>
                点击刷新
              </button>
            </div>
          )}
          {deleted && (
            <div className="update-banner deleted">
              <span>此笔记已被删除或移动，以下为删除前的内容</span>
            </div>
          )}
          {error && <div className="update-banner deleted">加载失败：{error}</div>}
          {missing && <div className="empty-hint">// 未找到笔记：{noteKey}</div>}
          {!snapshot && !missing && !error && <div className="skeleton-block tall" />}
          {snapshot && <DrawerBody doc={snapshot} notes={notes ?? []} inCount={inCount} onOpenNote={onOpenNote} />}
        </div>
      </aside>
    </>
  );
}
```

- [ ] **步骤 2：用完整实现替换 `App.tsx`**

项目管理用 `window.prompt / confirm / alert`（本地单用户工具，够用）。

`src/client/App.tsx`：

```tsx
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
    onSelect: (id) => route && navigate({ projectId: id, view: route.view, note: null }),
    onAdd: () => {
      const path = window.prompt('输入项目的绝对路径（目录下需有 .agents/notes）');
      if (path?.trim()) void runAction(() => api.addProject(path.trim()));
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
            {!hub.loaded && <div className="skeleton-block" />}
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
```

- [ ] **步骤 3：类型检查 + 全量测试**

```bash
bun run typecheck && bun test
```

预期：`tsc` 退出码 0；`115 pass`，`0 fail`（15 个文件；真实数据测试在本机为 4 个）

- [ ] **步骤 4：启动并走查真实数据（只读）**

```bash
bun run dev
```

浏览器打开 http://127.0.0.1:5173 ，逐项确认：

1. 地址自动规整为 `#<最近变动的项目>/baseline`；左栏 3 个项目按最近变动排序，各有条数 · 新鲜度、四色占比条、绿点。
2. 基线视图：4 张 KPI、承重墙 6 张卡（被引用 × N）、6 个分类列。点「避坑否决」→ 跳到决策清单且状态筛选为「已否决」。
3. 打开 `#Pi/baseline/note=2026-10-11-all-subagents-out-of-process`：顶部红色 verdict 中的链接可点击跳转；Decision 是完整多段（含列表）；`Acceptance criteria`、`Risks` 作为附加章节出现在 04 之后；血缘区有前置依据与派生影响。
4. 打开 Pi 中任一引用 `docs/decisions` 的笔记（如 `2026-10-09-agent-host-child-process`）：血缘区出现灰色「↗ 外部引用」。
5. 时间线选一个月份 → 切到决策清单 → 切回时间线：月份仍选中；再点左栏另一个项目：筛选恢复「全部」。
6. 按 `/` 聚焦搜索，输入 `codegraph`，↓ 选中第一项，↵ 打开抽屉；Esc 关闭抽屉。
7. 抽屉里点「复制反向代码注释」，剪贴板内容为 `// Note: 见 .agents/notes/<id>`。
8. 把窗口缩到 1280 宽，顶栏右侧信标仍完整可见。

- [ ] **步骤 5：走查实时同步（只用临时项目）**

```bash
mkdir -p /tmp/edm-sandbox/Sandbox/.agents/notes/implemented/feature
printf '# Agent Note: 沙盒\n\nStatus: implemented\n\n## Decision\n\n初始决定，见 [断链](./missing.md)\n' > /tmp/edm-sandbox/Sandbox/.agents/notes/implemented/feature/2026-10-12-sandbox.md
cygpath -w /tmp/edm-sandbox/Sandbox
```

在左栏点「+ 添加项目路径」，粘贴上一条命令输出的 Windows 路径。然后：

1. Sandbox 出现在左栏顶部，`config.json` 的 `projects` 多出这一项。
2. 打开 `#Sandbox/directory/note=2026-10-12-sandbox`，断链显示为红色。
3. 执行 `sed -i 's/初始决定/修改后的决定/' /tmp/edm-sandbox/Sandbox/.agents/notes/implemented/feature/2026-10-12-sandbox.md`：约 0.2 s 内抽屉顶部出现「此笔记已更新 · 点击刷新」，正文**不变**；点击后正文变为「修改后的决定」。
4. 再新建一篇 `proposed/process/2026-10-12-new.md`：清单无骨架闪烁地变为 2 条，顶栏 chip 变为 `Sandbox · 2 条`。
5. 左栏悬停 Sandbox 点 ✕ 移除；最后 `rm -rf /tmp/edm-sandbox`。

Ctrl+C 停止服务。

- [ ] **步骤 6：Commit**

```bash
git add src/client/components/NoteDrawer.tsx src/client/App.tsx
git commit -m "feat: 详情抽屉与完整应用装配"
```

### 任务 24：README 与收尾验证

**文件：**
- 创建：`README.md`

- [ ] **步骤 1：编写 README**

`README.md`：

````markdown
# 工程决策中心

多项目查看 `.agents/notes` 决策笔记的本地看板。单个 Bun 进程负责扫盘解析、API、SSE 实时推送和前端分发；笔记目录有任何增删改，页面自动更新。纯只读，不改动任何笔记文件。

设计文档：`docs/superpowers/specs/2026-10-12-multi-project-decision-hub-design.md`

## 启动

需要 Bun ≥ 1.3。

```bash
bun install
bun run dev      # 开发：前端 HMR + 服务端 --watch
bun run start    # 日常使用：无 HMR
```

打开 http://127.0.0.1:5173 。服务只监听 `127.0.0.1`。

其他脚本：

```bash
bun test            # 单元 + 集成 + 端到端
bun run typecheck   # tsc --noEmit
bun run fonts       # 重新下载本地字体（一般不需要，字体已随仓库提交）
```

## 配置 `config.json`

| 字段 | 含义 |
|---|---|
| `port` | 监听端口（只绑定 127.0.0.1） |
| `scanRoots` | 启动时在这些目录下查找含 `.agents/notes` 的项目 |
| `scanDepth` | 查找深度，扫描根本身为 0 |
| `projects` | 手动添加的项目，以及对任意项目的显示名 / 隐藏设置：`{ "path", "name", "hidden" }`，`name: null` 表示用文件夹名 |
| `watch.debounceMs` | 文件事件合并窗口 |
| `watch.rescanRootsMs` | 定期重扫 `scanRoots` 发现新项目的间隔，0 表示关闭 |

页面左栏的「添加 / 重命名 / 隐藏 / 移除」会写回 `config.json`（先写临时文件再 rename，原子替换），也可以手工编辑。文件损坏时服务使用内置默认值（扫描根为本应用目录的上一级）并在左栏顶部提示，**不会覆盖你的文件**，修好后重启生效。

用 `EDM_CONFIG` 环境变量可以指定其他配置文件路径。

## 笔记识别规则

- 只读 `<项目>/.agents/notes/<lifecycle>/<class>/…/*.md`，`lifecycle` ∈ `implemented | proposed | rejected | archived`
- 跳过 `.` 开头的文件和目录；`xxx.zh.md` 与 `xxx.md` 视为同一篇，以 `.zh.md` 为准
- 链接三态：项目内能找到 → 可点击；指向 notes 目录之外 → 灰色「↗ 外部引用」；项目内找不到 → 红色「⚠ 断链」。不跨项目解析

## OneDrive 注意事项

本目录位于 OneDrive 同步范围内时，`node_modules`（数千个小文件）会被同步，产生大量流量。OneDrive 没有按文件夹名排除的设置，推荐把 `node_modules` 放到同步目录之外，再用目录联接（junction）接回来：

在本目录打开 `cmd`（不是 PowerShell / Git Bash）执行：

```cmd
rmdir /s /q node_modules
mkdir "%LOCALAPPDATA%\edm-node_modules"
mklink /J node_modules "%LOCALAPPDATA%\edm-node_modules"
bun install
```

`bun install` 会沿用这个联接。服务启动时若检测到应用在 OneDrive 内而 `node_modules` 是实体目录，会在控制台打印提示（不会自动修改任何 OneDrive 设置）。

## 降级行为

| 情况 | 表现 |
|---|---|
| 项目路径失效 / 没有 `.agents/notes` | 左栏灰显并标「路径失效」，其他项目不受影响 |
| 文件监听建立失败 | 该项目切为「手动刷新」，顶栏信标变灰，点击信标或左栏 ↻ 重扫 |
| SSE 断开 | 浏览器自动重连，重连后全量刷新 |
````

- [ ] **步骤 2：最终验证**

```bash
bun run typecheck
bun test
git status --short
```

预期：`tsc` 退出码 0；全部测试通过、`0 fail`；`git status` 只剩 README 未提交，**真实项目目录无任何改动**（可在 Pi / gren-ssh / electron-mall-manager 下各跑一次 `git status --short .agents/notes` 确认）。

- [ ] **步骤 3：Commit**

```bash
git add README.md
git commit -m "docs: 启动方式、配置说明与 OneDrive 注意事项"
```

---

## 规格覆盖对照

| 规格章节 | 落地任务 |
|---|---|
| §1.2 多项目切换 / 实时同步 / 单进程 / 只读 | 11、19、21、23 |
| §3 配置、原子写、损坏处理 | 7、11（409）、21（左栏错误提示） |
| §4.1 笔记发现规则、`.zh.md` 归一化 | 5 |
| §4.2 解析器修正、`\Z` 陷阱、verdict、extraSections、围栏 | 3 |
| §4.3 链接三态 | 4、20 |
| §4.4 引用图谱项目内封闭 | 6、14 |
| §4.5 / §4.6 全量重扫、列表不含 rawBody | 5、11 |
| §5.1–5.4 内存模型、发现、排序、配色 | 6、8、11、15、21 |
| §5.5 API 全部 8 个端点 | 11 |
| §5.6 SSE 事件与心跳 | 10、11、12 |
| §5.7 / §7.1 错误处理与降级 | 7、11、19、21、22 |
| §6.1 布局（左栏 186 px、选中态） | 18、21 |
| §6.3 hash 路由、replaceState、筛选保留 / 重置 | 15、16、19、22 |
| §6.4 实时同步前端行为、抽屉更新提示条 | 19、23 |
| §6.5 保留功能清单（KPI 跳转、时间线双层筛选、避坑检索、三维筛选、五段抽屉、反向注释、全局搜索、血缘、深链） | 16、20–23 |
| §6.6 修正项 | 3、4、16、18、20、22 |
| §6.7 设计令牌、网格背景、本地字体 | 18 |
| §8.1 OneDrive | 13、24 |
| §9 测试策略（单元 / 集成 / 端到端 / 前端手动） | 3–17、23 |
