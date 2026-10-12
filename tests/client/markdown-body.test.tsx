import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LinkResult } from '../../src/shared/types';
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

const LINKS: LinkResult[] = [
  { kind: 'resolved', targetId: 'implemented/a/x.md', rawHref: './x.md', anchor: '' },
  { kind: 'external', rawHref: '../../../../docs/d.md', anchor: '' },
  { kind: 'unresolved', rawHref: './missing.md', anchor: '' },
];

test('链接按 rawHref 对回三态：resolved 为按钮、external 带 ↗、unresolved 为断链', () => {
  const html = renderToStaticMarkup(
    <MarkdownBody source={'[甲](./x.md) [乙](../../../../docs/d.md) [丙](./missing.md)'} links={LINKS} onOpenNote={() => {}} />,
  );
  expect(html).toContain('<button type="button" class="md-link">甲</button>');
  expect(html).toContain('class="md-link external"');
  expect(html).toContain('↗');
  expect(html).toContain('class="md-link broken"');
  expect(html).toContain('（断链）');
});

test('协议白名单大小写不敏感；协议相对 URL 不渲染为链接', () => {
  const html = renderToStaticMarkup(
    <MarkdownBody source={'[a](JaVaScRiPt:x) [b](//evil.com) [c](HTTP://ok.example)'} links={[]} onOpenNote={() => {}} />,
  );
  expect(html).not.toMatch(/href="(javascript:|\/\/evil)/i);
  expect(html).toContain('href="HTTP://ok.example"');
});

test('段落内换行渲染为 <br/>；inline 模式只渲染行内', () => {
  expect(renderToStaticMarkup(<MarkdownBody source={'一\n二'} links={[]} onOpenNote={() => {}} />)).toContain('一<br/>二');
  expect(renderToStaticMarkup(<MarkdownBody source={'**粗**'} links={[]} onOpenNote={() => {}} inline />)).toBe(
    '<span class="md-body"><b>粗</b></span>',
  );
});
