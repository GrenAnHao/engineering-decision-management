import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { NoteDrawer } from '../../src/client/components/NoteDrawer';

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
