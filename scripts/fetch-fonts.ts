// 一次性脚本：从 Google Fonts 下载 latin 子集可变字体到 src/client/assets/fonts/。
// 运行：bun run fonts。字体随仓库提交，运行期完全离线。
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FONTS = [
  { file: 'SpaceGrotesk-latin.woff2', family: 'Space+Grotesk:wght@300..700' },
  { file: 'PlusJakartaSans-latin.woff2', family: 'Plus+Jakarta+Sans:wght@200..800' },
  { file: 'JetBrainsMono-latin.woff2', family: 'JetBrains+Mono:wght@100..800' },
  { file: 'JetBrainsMono-Italic-latin.woff2', family: 'JetBrains+Mono:ital,wght@1,100..800' },
];

const FETCH_TIMEOUT_MS = 15_000;

// 需要现代浏览器 UA，Google Fonts 才会返回 woff2
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** 从 css2 响应中取出 `/* latin *\/` 块的 woff2 地址 */
export function latinWoff2Url(css: string): string | null {
  return /\/\* latin \*\/\s*@font-face\s*\{[^}]*?src:\s*url\((https:\/\/[^)]+\.woff2)\)/.exec(css)?.[1] ?? null;
}

async function main(): Promise<void> {
  const outDir = join(import.meta.dir, '..', 'src', 'client', 'assets', 'fonts');
  await mkdir(outDir, { recursive: true });
  for (const font of FONTS) {
    const cssRes = await fetch(`https://fonts.googleapis.com/css2?family=${font.family}&display=swap`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!cssRes.ok) throw new Error(`${font.file} 下载失败：HTTP ${cssRes.status} ${cssRes.url}`);
    const css = await cssRes.text();
    const url = latinWoff2Url(css);
    if (!url) throw new Error(`未在 CSS 中找到 latin 子集：${font.family}`);
    const fontRes = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!fontRes.ok) throw new Error(`${font.file} 下载失败：HTTP ${fontRes.status} ${fontRes.url}`);
    const bytes = new Uint8Array(await fontRes.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== 'wOF2') throw new Error(`${font.file} 不是有效的 woff2`);
    await writeFile(join(outDir, font.file), bytes);
    console.log(`${font.file}  ${(bytes.length / 1024).toFixed(1)} KB`);
  }
}

if (import.meta.main) await main();
