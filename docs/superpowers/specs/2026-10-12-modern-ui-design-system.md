# 界面改版：设计系统约定

2026-10-12。把前端从「平移自旧看板的手写 CSS」改为 Tailwind v4 + 语义令牌 + 一组通用组件，保留已确认的布局（左栏项目 + 顶栏视图标签 + 右侧详情抽屉），视觉与交互现代化。

## 1. 技术栈

| 项 | 选择 |
|---|---|
| 样式 | Tailwind CSS 4（`@tailwindcss/vite`，CSS 优先配置，见 `src/client/styles/index.css`） |
| 变体 / 合并 | `tailwind-variants`（`tv`）+ `clsx` + `tailwind-merge`，统一从 `src/client/ui/tw.ts` 取 `cn` / `tv` |
| 图标 | `lucide-react`（不用 emoji） |
| 主题 | `<html data-theme="light|dark">`，偏好存 `localStorage['edm-theme']`（`system` / `light` / `dark`），逻辑在 `src/client/theme.ts`；`index.html` 首帧前内联脚本避免闪白 |
| 对话框 | 原生 `<dialog>`（`showModal()` 自带焦点陷阱 / Esc），封装在 `ui/Modal.tsx`；`ui/dialogs.tsx` 提供 `useDialogs()`：`prompt` / `confirm` / `toast`，替代 `window.prompt/confirm/alert` |
| 字体 | 沿用本地 woff2：Plus Jakarta Sans（正文）、Space Grotesk（标题 / 数字）、JetBrains Mono（元信息 / 代码）；中文回落系统字体 |

## 2. 令牌

组件只引用**语义名**，不写色值；浅色 / 深色两套取值在 `styles/tokens.css`，切主题只是 `data-theme` 变化，所以通常不需要 `dark:` 前缀。

| 工具类 | 含义 |
|---|---|
| 页面底色走 `<body>` 的 `var(--bg)`；`bg-surface`（卡片）`bg-surface-2`（输入框 / 次级底）`bg-surface-3`（悬停 / 进度底） | 背景层级 |
| `ring-line` / `ring-line-strong` / `border-line` | 发丝线（卡片用 `ring-1 ring-line`，控件用 `ring-line-strong`） |
| `text-fg`（主）`text-fg-muted`（次）`text-fg-subtle`（元信息 / 占位） | 文字层级，`fg-subtle` 在白底上对比度 ≥ 4.5:1 |
| `bg-accent` + `text-accent-fg`（填充）`text-accent-text`（文字 / 图标）`bg-accent-soft`（选中底）`ring-accent/40` | 强调色（浅色 #2563eb；深色填充更深、文字更亮） |
| `shadow-card` / `shadow-raised` / `shadow-pop` | 三级阴影（静置 / 悬停 / 浮层） |
| `font-sans` / `font-display` / `font-mono` / `text-2xs`（11px） | 字体与小字号 |

语义色（状态、分类）用 Tailwind 调色板的**软底色**写法，必须带深色文字变体，且只通过 `ui/Badge.tsx` 的 `tone` 使用：`bg-{c}-500/10 text-{c}-700 ring-{c}-600/20 dark:text-{c}-300`。状态 → 色：已落地 emerald、待评审 amber、已否决 rose、已归档 neutral；分类 → 色见 `labels.ts` 的 `classTone()`。

## 3. 通用组件（`src/client/ui/`）

| 组件 | 用途 |
|---|---|
| `Button`（`variant`: primary / secondary / ghost / danger；`size`: sm / md / icon） | 所有按钮 |
| `Badge`（`tone`）、`TONE_DOT` | 徽标、图例色点；业务徽标在 `components/Badge.tsx`（`StatusBadge` / `ClassBadge`） |
| `Panel`（`icon` `title` `annotation` `bodyClassName`） | 每个视图的主体分区卡片 |
| `SearchField`、`Select`、`FIELD_CLASS` | 输入框 / 下拉（原生 select 加自绘箭头） |
| `ToggleChip`（`pressed` `count`） | 筛选胶囊 |
| `Skeleton`、`DashboardSkeleton`、`EmptyState`（`compact`） | 加载 / 空态 / 错误态 |
| `Banner` + `BannerButton`（`tone`: amber / rose） | 行内提示条（更新提示、连接异常） |
| `Kbd`、`MOD_KEY_LABEL` | 快捷键键帽 |
| `Modal`、`useDialogs()` | 模态框、prompt / confirm / toast |

参照实现：`views/BaselineView.tsx`、`components/KpiRow.tsx`、`components/TopBar.tsx`、`components/ProjectRail.tsx`、`components/CommandPalette.tsx`。

## 4. 版式约定

- **视图根节点**：`<section className="animate-view-in space-y-6">`；主体用 `Panel` 包起来。
- **卡片**：`rounded-xl bg-surface shadow-card ring-1 ring-line`；可点击的再加 `cursor-pointer transition-all duration-200 hover:-translate-y-px hover:shadow-raised hover:ring-accent/40`，并保留 `clickable()`（`a11y.ts`，给 div 加 role=button / tabIndex / Enter·Space）。
- **文字**：标题 `font-display font-bold text-fg`；正文 `text-[13px] leading-relaxed text-fg-muted`；元信息（日期、slug、计数）`font-mono text-[11px] text-fg-subtle`；数字加 `tabular`。
- **间距**：卡片内边距 p-4 / p-5，卡片间距 gap-3 / gap-4，分区间距 space-y-6；圆角卡片 `rounded-xl`、控件 `rounded-lg`、徽标 `rounded-md`、胶囊 `rounded-full`。
- **响应式**：移动优先；`lg`（1024px）以下左栏变抽屉；网格用 `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` 这类逐级增列；表格在 `md` 以下收起次要列。
- **动效**：只用 `transition-*` 与 `animate-*`（`animate-view-in` / `animate-fade-in` / `animate-pop-in` / `animate-slide-in-right` / `animate-slide-up`），全局已处理 `prefers-reduced-motion`。
- **无障碍**：保留原有语义（role、aria-*、`title`）；`:focus-visible` 全局已有 2px accent 描边，不要再 `outline-none`（输入框自带 `ring-2` 聚焦环除外）；纯图标按钮必须有 `aria-label`；装饰性图标 `aria-hidden="true"`。
- **不要**：写色值（#xxx / rgb）、`style={{}}` 里的静态样式（动态值如进度宽度、项目色点除外）、新增 `.css` 里的业务类名、引入新依赖。

## 5. 迁移规则

- 业务逻辑、props、`derive.ts` 等纯函数一律不动；只改渲染层与样式。
- 现有测试里**语义**断言要继续成立（role / aria / 文案 / 链接白名单等）；只有因类名变化而失败的断言才改，改成断言新的语义或稳定的类名钩子。
- `components/MarkdownBody.tsx` 渲染出的元素没有逐个加类名，正文排版放在 `styles/markdown.css`（`.md-body` 下的后代选择器 + 令牌），类名钩子 `md-body` / `md-link` / `external` / `broken` 保持不变。
- 旧的手写 CSS（`app.css` / `shell.css` / `drawer.css` / 旧 `tokens.css`）已全部删除，历史见 git。

## 6. 进度

| 部分 | 状态 |
|---|---|
| 令牌、主题、`ui/` 组件、对话框 / toast | 完成 |
| 顶栏、左栏（含窄屏抽屉）、⌘K 命令面板、App 外壳 | 完成 |
| 架构基线、演进时间线、避坑智库、决策清单 | 完成 |
| 详情抽屉、Markdown 排版（`styles/markdown.css`，唯一保留的手写 CSS）、血缘链路 | 完成 |

## 7. 已知取舍

- 决策清单的表格版式在 `xl`（1280px）以上才出现；窄一些时左栏占掉 256px，表格里的标题列只剩约 150px，改为每行上下堆叠。标题最多两行（`line-clamp-2`）。
- Markdown 表格自身作为横向滚动容器（`display: block`），个别读屏器可能丢失表格语义；若在意，可在 `MarkdownBody` 里给 table 包一层 div。
- 时间线卡片摘要末尾无条件带「…」（沿用旧行为）。
- 主题切换的一瞬间会关掉全部 CSS 过渡（`theme-switching`），避免带过渡与不带过渡的元素颜色变化不同步。
- 表单控件的描边（`--line-strong`）对比度约 1.4:1，低于 WCAG 1.4.11 建议的 3:1：取舍是保持发丝线的轻盈，控件靠背景差、占位字和聚焦环辨认。
