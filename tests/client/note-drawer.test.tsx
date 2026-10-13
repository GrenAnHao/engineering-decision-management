import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LineageChips } from '../../src/client/components/LineageChips';
import { NoteDrawer } from '../../src/client/components/NoteDrawer';
import type { NoteDoc } from '../../src/shared/types';

const noop = () => {};

test('抽屉渲染为带标题关联的模态对话框，并带关闭按钮', () => {
  const html = renderToStaticMarkup(
    <NoteDrawer projectId="p" noteKey="x" notes={null} inCount={{}} onClose={noop} onOpenNote={noop} />,
  );
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain('aria-labelledby="note-drawer-title"');
  expect(html).toContain('title="退出 (Esc)"');
});

test('笔记列表已加载但找不到该笔记时提示未找到', () => {
  const html = renderToStaticMarkup(
    <NoteDrawer projectId="p" noteKey="ghost" notes={[]} inCount={{}} onClose={noop} onOpenNote={noop} />,
  );
  expect(html).toContain('未找到笔记：ghost');
});

const doc = (over: Partial<NoteDoc>): NoteDoc => ({
  id: 'a.md',
  slug: 'a',
  lifecycle: 'implemented',
  cls: 'feature',
  date: '2026-10-01',
  title: '甲',
  verdict: '',
  problem: '',
  decision: '',
  alternatives: '',
  consequences: '',
  extraSections: [],
  links: [],
  hash: 'h',
  rawBody: '',
  ...over,
});

test('血缘链路：出链按目标去重并与入链一起渲染为按钮，外部引用与断链只是说明', () => {
  const a = doc({
    links: [
      { kind: 'resolved', targetId: 'b.md', rawHref: './b.md', anchor: '' },
      { kind: 'resolved', targetId: 'b.md', rawHref: './b.md#x', anchor: '#x' },
      { kind: 'external', rawHref: '../docs/d.md', anchor: '' },
      { kind: 'unresolved', rawHref: './gone.md', anchor: '' },
    ],
  });
  const c = doc({ id: 'c.md', title: '丙', links: [{ kind: 'resolved', targetId: 'a.md', rawHref: './a.md', anchor: '' }] });
  const html = renderToStaticMarkup(<LineageChips note={a} notes={[a, doc({ id: 'b.md', title: '乙' }), c]} onOpenNote={noop} />);
  expect(html.match(/<button/g)).toHaveLength(2); // 乙（出链，两条同目标只留一个）+ 丙（入链）
  expect(html).toContain('title="../docs/d.md"');
  expect(html).toContain('title="./gone.md"');
});

test('血缘链路：没有任何引用时给出独立节点提示', () => {
  const a = doc({});
  expect(renderToStaticMarkup(<LineageChips note={a} notes={[a]} onOpenNote={noop} />)).toContain('独立节点，暂无交叉引用');
});
