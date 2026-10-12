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

  test('Status 词大小写不敏感', () => {
    expect(parseNote(`# Agent Note: t\n\nStatus: Rejected — 原因\n`, 'implemented/a/x.md').lifecycle).toBe('rejected');
  });

  test('章节正文里的 Status 行不参与判定', () => {
    const note = parseNote(`# Agent Note: t\n\n## Problem\n\nStatus: rejected — 示例\n`, 'proposed/a/x.md');
    expect(note.lifecycle).toBe('proposed');
    expect(note.verdict).toBe('');
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

  test('info string 含反引号的行不是围栏（行首内联代码）', () => {
    expect(maskFences('```x``` 是内联\n## y')).toBe('```x``` 是内联\n## y');
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
