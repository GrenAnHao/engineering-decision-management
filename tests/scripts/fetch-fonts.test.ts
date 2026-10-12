import { expect, test } from 'bun:test';
import { latinWoff2Url } from '../../scripts/fetch-fonts';

const block = (subset: string, file: string) =>
  `/* ${subset} */\n@font-face {\n  font-family: 'X';\n  src: url(https://fonts.gstatic.com/s/x/${file}.woff2) format('woff2');\n}\n`;

test('同时含 latin-ext 与 latin 块时取 latin 的 URL', () => {
  const css = block('latin-ext', 'ext') + block('latin', 'plain');
  expect(latinWoff2Url(css)).toBe('https://fonts.gstatic.com/s/x/plain.woff2');
});

test('没有 latin 块时返回 null', () => {
  expect(latinWoff2Url(block('latin-ext', 'ext') + block('cyrillic', 'cyr'))).toBeNull();
});
