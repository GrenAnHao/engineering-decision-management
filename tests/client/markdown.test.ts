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

  test('反斜杠转义：粗体内的 \\* 是字面星号', () => {
    expect(parseInline('**SAFETY_\\***')).toEqual([{ t: 'strong', c: [{ t: 'text', v: 'SAFETY_*' }] }]);
    expect(parseInline('a \\[b\\] c')).toEqual([{ t: 'text', v: 'a [b] c' }]);
  });

  test('病态超长单行不会卡死', () => {
    const started = performance.now();
    parseInline('[a'.repeat(40_000));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('parseBlocks', () => {
  test('段落、子标题、列表、引用', () => {
    const blocks = parseBlocks('第一行\n第二行\n\n### 涉及文件\n\n- a\n  续行\n- b\n\n1. x\n2. y\n\n> 引用');
    expect(blocks.map((b) => b.t)).toEqual(['p', 'h', 'ul', 'ol', 'quote']);
    expect(blocks[0]).toEqual({ t: 'p', c: [{ t: 'text', v: '第一行\n第二行' }] });
    expect(blocks[1]).toMatchObject({ t: 'h', level: 3 });
    expect(blocks[2]).toEqual({
      t: 'ul',
      items: [
        { c: [{ t: 'text', v: 'a\n续行' }], children: [] },
        { c: [{ t: 'text', v: 'b' }], children: [] },
      ],
    });
  });

  test('嵌套列表保留层级', () => {
    expect(parseBlocks('- 父\n  - 子一\n  - 子二\n- 兄')).toEqual([
      {
        t: 'ul',
        items: [
          {
            c: [{ t: 'text', v: '父' }],
            children: [
              {
                t: 'ul',
                items: [
                  { c: [{ t: 'text', v: '子一' }], children: [] },
                  { c: [{ t: 'text', v: '子二' }], children: [] },
                ],
              },
            ],
          },
          { c: [{ t: 'text', v: '兄' }], children: [] },
        ],
      },
    ]);
  });

  test('表格：表头 + 数据行', () => {
    expect(parseBlocks('| 列 A | 列 B |\n| --- | :---: |\n| 1 | `x` |\n| 2 | y |\n\n后')).toEqual([
      {
        t: 'table',
        head: [[{ t: 'text', v: '列 A' }], [{ t: 'text', v: '列 B' }]],
        rows: [
          [[{ t: 'text', v: '1' }], [{ t: 'code', v: 'x' }]],
          [[{ t: 'text', v: '2' }], [{ t: 'text', v: 'y' }]],
        ],
      },
      { t: 'p', c: [{ t: 'text', v: '后' }] },
    ]);
  });

  test('围栏代码块原样保留，内部不解析', () => {
    expect(parseBlocks('前\n```ts\n## 不是标题\n- 不是列表\n```\n后')).toEqual([
      { t: 'p', c: [{ t: 'text', v: '前' }] },
      { t: 'pre', lang: 'ts', v: '## 不是标题\n- 不是列表' },
      { t: 'p', c: [{ t: 'text', v: '后' }] },
    ]);
  });

  test('info 含反引号的行不是围栏', () => {
    expect(parseBlocks('```x``` 是行内\n\n后').map((b) => b.t)).toEqual(['p', 'p']);
  });

  test('未闭合围栏吞到结尾', () => {
    expect(parseBlocks('```\nx\ny')).toEqual([{ t: 'pre', lang: '', v: 'x\ny' }]);
  });

  test('空输入返回空数组', () => {
    expect(parseBlocks('')).toEqual([]);
  });

  test('列表项内的围栏代码块归属该项', () => {
    expect(parseBlocks('- a\n  ```\n  code\n  - not list\n  ```\n- b')).toEqual([
      {
        t: 'ul',
        items: [
          { c: [{ t: 'text', v: 'a' }], children: [{ t: 'pre', lang: '', v: 'code\n- not list' }] },
          { c: [{ t: 'text', v: 'b' }], children: [] },
        ],
      },
    ]);
  });

  test('超深嵌套不会卡死', () => {
    const md = Array.from({ length: 1000 }, (_, i) => `${' '.repeat(i * 2)}- x`).join('\n');
    const started = performance.now();
    parseBlocks(md);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
