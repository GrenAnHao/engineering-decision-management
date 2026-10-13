import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { renderEmbedEntry } from '../../scripts/embed-entry';

const root = join('D:', 'repo');
const entryDir = join(root, 'dist', 'embed');
const bootModule = join(root, 'src', 'server', 'boot.ts');
const staticModule = join(root, 'src', 'server', 'static.ts');
const files = new Map([
  ['/index.html', join(root, 'dist', 'web', 'index.html')],
  ['/assets/app-abc.js', join(root, 'dist', 'web', 'assets', 'app-abc.js')],
]);

test('入口以 type: file 内嵌每个产物，路径统一为相对入口目录的正斜杠', () => {
  const code = renderEmbedEntry(files, { entryDir, bootModule, staticModule });
  expect(code).toContain('import asset0 from "../web/index.html" with { type: "file" };');
  expect(code).toContain('import asset1 from "../web/assets/app-abc.js" with { type: "file" };');
  expect(code).not.toContain('\\');
});

test('入口把 URL 路径映射到内嵌文件，并交给 boot 启动', () => {
  const code = renderEmbedEntry(files, { entryDir, bootModule, staticModule });
  expect(code).toContain('["/index.html", asset0]');
  expect(code).toContain('["/assets/app-abc.js", asset1]');
  expect(code).toContain('import { boot } from "../../src/server/boot";');
  expect(code).toContain('import { loadWebAssets } from "../../src/server/static";');
  expect(code).toContain('await boot({ web: await loadWebAssets(embedded) });');
});

test('URL 路径中的特殊字符被转义，不会破坏生成的代码', () => {
  const tricky = new Map([['/a"b\\c.js', join(root, 'dist', 'web', 'a.js')]]);
  const code = renderEmbedEntry(tricky, { entryDir, bootModule, staticModule });
  expect(code).toContain(String.raw`["/a\"b\\c.js", asset0]`);
});

test('没有产物时拒绝生成（说明 vite build 没有产出）', () => {
  expect(() => renderEmbedEntry(new Map(), { entryDir, bootModule, staticModule })).toThrow('没有前端产物');
});
