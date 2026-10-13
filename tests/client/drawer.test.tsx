import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Drawer } from '../../src/client/ui/Drawer';

const noop = () => {};

test('渲染为模态对话框并带读屏名称', () => {
  const html = renderToStaticMarkup(
    <Drawer label="通知" onClose={noop}>
      内容
    </Drawer>,
  );
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain('aria-label="通知"');
});

test('不传 labelledBy 时不输出 aria-labelledby，传了则输出', () => {
  const without = renderToStaticMarkup(<Drawer label="通知" onClose={noop}>x</Drawer>);
  expect(without).not.toContain('aria-labelledby');
  const withId = renderToStaticMarkup(<Drawer label="通知" labelledBy="t" onClose={noop}>x</Drawer>);
  expect(withId).toContain('aria-labelledby="t"');
});

test('className 追加到面板上，并覆盖基础底色', () => {
  const html = renderToStaticMarkup(
    <Drawer label="通知" className="w-[min(100vw,26rem)] bg-(--bg)" onClose={noop}>
      x
    </Drawer>,
  );
  expect(html).toContain('w-[min(100vw,26rem)]');
  expect(html).toContain('bg-(--bg)');
  expect(html).not.toContain('bg-surface');
});

test('children 原样渲染在面板内', () => {
  const html = renderToStaticMarkup(
    <Drawer label="通知" onClose={noop}>
      <p id="inner">面板内容</p>
    </Drawer>,
  );
  expect(html).toMatch(/<aside[^>]*>.*<p id="inner">面板内容<\/p>.*<\/aside>/);
});

test('面板带 tabindex=-1，没有 data-autofocus 时可以接住焦点', () => {
  const html = renderToStaticMarkup(<Drawer label="通知" onClose={noop}>x</Drawer>);
  expect(html).toMatch(/<aside[^>]*tabindex="-1"/);
});
