import { expect, test } from 'bun:test';
import { Monitor, Moon, Sun } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { nextOption, SegmentedControl, type SegmentOption } from '../../src/client/ui/SegmentedControl';

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
  expect(html).toContain('<nav');
  expect(html).not.toContain('role="radiogroup"');
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).not.toContain('role="radio"');
  expect(html).toContain('max-lg:sr-only');
});

test('radio 模式没有选中项时，第一项可 Tab 聚焦', () => {
  const html = renderToStaticMarkup(<SegmentedControl mode="radio" label="主题" value={'none' as Pref} options={OPTIONS} onChange={noop} />);
  expect(html.match(/aria-checked="true"/g)).toBeNull();
  expect(html).toMatch(/data-value="system"[^>]*tabindex="0"|tabindex="0"[^>]*data-value="system"/);
  expect(html.match(/tabindex="0"/g)).toHaveLength(1);
});

test('nextOption：→ 与 ↓ 前进，到末尾回绕到第一项', () => {
  expect(nextOption(OPTIONS, 'system', 'ArrowRight')?.value).toBe('light');
  expect(nextOption(OPTIONS, 'light', 'ArrowDown')?.value).toBe('dark');
  expect(nextOption(OPTIONS, 'dark', 'ArrowRight')?.value).toBe('system');
});

test('nextOption：← 与 ↑ 后退，到开头回绕到最后一项', () => {
  expect(nextOption(OPTIONS, 'dark', 'ArrowLeft')?.value).toBe('light');
  expect(nextOption(OPTIONS, 'light', 'ArrowUp')?.value).toBe('system');
  expect(nextOption(OPTIONS, 'system', 'ArrowLeft')?.value).toBe('dark');
});

test('nextOption：非方向键返回 null', () => {
  expect(nextOption(OPTIONS, 'light', 'Enter')).toBeNull();
  expect(nextOption(OPTIONS, 'light', 'constructor')).toBeNull();
});

test('nextOption：value 不在列表里时从第一项起算', () => {
  expect(nextOption(OPTIONS, 'none' as Pref, 'ArrowRight')?.value).toBe('light');
  expect(nextOption(OPTIONS, 'none' as Pref, 'ArrowLeft')?.value).toBe('dark');
});

test('nextOption：空列表返回 null', () => {
  expect(nextOption([], 'light' as Pref, 'ArrowRight')).toBeNull();
});
