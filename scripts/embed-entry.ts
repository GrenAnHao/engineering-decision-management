import { relative, sep } from 'node:path';

export type EmbedEntryPaths = {
  /** 生成的入口文件所在目录，import 路径相对它计算 */
  entryDir: string;
  /** src/server/boot.ts 的绝对路径 */
  bootModule: string;
  /** src/server/static.ts 的绝对路径 */
  staticModule: string;
};

/** 绝对路径 → 相对入口目录的 import 说明符（统一正斜杠，去掉 .ts 后缀） */
function specifier(entryDir: string, abs: string): string {
  const rel = relative(entryDir, abs).split(sep).join('/').replace(/\.ts$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * 生成单体可执行文件的入口源码：用 `with { type: 'file' }` 把 vite build 的每个产物内嵌进 exe，
 * 再以「URL 路径 → 内嵌文件」读入内存交给 boot 启动。源码里没有任何运行期扫盘，exe 不依赖 dist/web。
 */
export function renderEmbedEntry(files: ReadonlyMap<string, string>, paths: EmbedEntryPaths): string {
  if (files.size === 0) throw new Error('没有前端产物可内嵌：请先运行 vite build');
  const imports: string[] = [];
  const entries: string[] = [];
  let index = 0;
  for (const [url, abs] of files) {
    const name = `asset${index++}`;
    imports.push(`import ${name} from ${JSON.stringify(specifier(paths.entryDir, abs))} with { type: "file" };`);
    entries.push(`  [${JSON.stringify(url)}, ${name}],`);
  }
  return [
    '// 由 scripts/build.ts 生成，不要手工修改',
    `import { boot } from ${JSON.stringify(specifier(paths.entryDir, paths.bootModule))};`,
    `import { loadWebAssets } from ${JSON.stringify(specifier(paths.entryDir, paths.staticModule))};`,
    ...imports,
    '',
    'const embedded = new Map<string, string>([',
    ...entries,
    ']);',
    '',
    'await boot({ web: await loadWebAssets(embedded) });',
    '',
  ].join('\n');
}
