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
