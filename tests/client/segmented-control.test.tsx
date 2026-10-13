import { expect, test } from 'bun:test';
import { Monitor, Moon, Sun } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SegmentedControl, type SegmentOption } from '../../src/client/ui/SegmentedControl';

type Pref = 'system' | 'light' | 'dark';
const OPTIONS: readonly SegmentOption<Pref>[] = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
];
const noop = () => {};

test('radio 模式：radiogroup + aria-checked，只有选中项可 Tab 聚焦', () => {
  const html = renderToStaticMarkup(<SegmentedControl mode="radio" label="主题" value="light" options={OPTIONS} onChange={noop} iconOnly />);
  expect(html).toContain('role="radiogroup"');
  expect(html).toContain('aria-label="主题"');
  expect(html.match(/role="radio"/g)).toHaveLength(3);
  expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  expect(html).toMatch(/data-value="light"[^>]*tabindex="0"|tabindex="0"[^>]*data-value="light"/);
  expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
  expect(html).not.toContain('aria-current');
});

test('只显示图标时文字仍在 sr-only 里，并作为 title', () => {
  const html = renderToStaticMarkup(<SegmentedControl mode="radio" label="主题" value="system" options={OPTIONS} onChange={noop} iconOnly />);
  expect(html).toContain('title="跟随系统"');
  expect(html).toContain('<span class="sr-only">跟随系统</span>');
});

test('nav 模式：navigation + aria-current，不带 radio 语义', () => {
  const html = renderToStaticMarkup(<SegmentedControl mode="nav" label="视图" value="dark" options={OPTIONS} onChange={noop} iconOnly="below-lg" />);
  expect(html).toContain('role="navigation"');
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).not.toContain('role="radio"');
  expect(html).toContain('max-lg:sr-only');
});
