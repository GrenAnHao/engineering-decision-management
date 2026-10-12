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

数值字段有范围限制，越界时该字段回落为默认值：`port` 1–65535，`scanDepth` 0–10，`watch.debounceMs` 10–10000，`watch.rescanRootsMs` 为 0（关闭）或 1000–86400000。

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
