import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownBody } from '../../src/client/components/MarkdownBody';

test('只有 http(s) 链接渲染为 <a>；javascript: 等协议不产生链接', () => {
  const html = renderToStaticMarkup(
    <MarkdownBody source={'[坏](javascript:alert(1)) [好](https://example.com)'} links={[]} onOpenNote={() => {}} />,
  );
  expect(html).not.toContain('javascript:');
  expect(html).toContain('href="https://example.com"');
});

test('嵌套列表与表格被渲染', () => {
  const html = renderToStaticMarkup(
    <MarkdownBody source={'- 父\n  - 子\n\n| a | b |\n| --- | --- |\n| 1 | 2 |'} links={[]} onOpenNote={() => {}} />,
  );
  expect(html).toContain('<li>父<ul><li>子</li></ul></li>');
  expect(html).toContain('<th>a</th>');
  expect(html).toContain('<td>2</td>');
});
