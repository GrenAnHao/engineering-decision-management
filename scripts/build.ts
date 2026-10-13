// 打包单体可执行文件：vite build → 把产物内嵌进生成的入口 → bun build --compile。运行：bun run build
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { scanWebDir } from '../src/server/static';
import { renderEmbedEntry } from './embed-entry';

const root = resolve(import.meta.dir, '..');
const distDir = join(root, 'dist');
const entryDir = join(distDir, 'embed');

async function run(cmd: string[], cwd = root): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${cmd.join(' ')} 失败（退出码 ${code}）`);
}

async function main(): Promise<void> {
  await run([process.execPath, 'run', 'build:web']);

  const files = scanWebDir(join(distDir, 'web'));
  if (!files) throw new Error('vite build 之后仍然没有 dist/web/index.html');

  await mkdir(entryDir, { recursive: true });
  const entry = join(entryDir, 'entry.ts');
  await writeFile(
    entry,
    renderEmbedEntry(files, {
      entryDir,
      bootModule: join(root, 'src', 'server', 'boot.ts'),
      staticModule: join(root, 'src', 'server', 'static.ts'),
    }),
  );

  // 先删旧的 exe：它正在运行时 Windows 删不掉，这里直接给出可读的原因，而不是让 bun 编译到一半失败
  const outfile = join(distDir, 'decision-hub');
  const exe = process.platform === 'win32' ? `${outfile}.exe` : outfile;
  await rm(exe, { force: true }).catch(() => {
    throw new Error(`无法覆盖 ${exe}：它可能正在运行，请先关闭`);
  });

  // 在 dist/ 里编译：bun 失败时会把约 100 MB 的临时文件留在当前目录，不能让它落在仓库根（OneDrive 会同步）
  await run([process.execPath, 'build', entry, '--compile', '--minify', '--outfile', outfile], distDir);
}

if (import.meta.main) {
  await main().catch((err: unknown) => {
    console.error(`[构建失败] ${(err as Error).message}`);
    process.exit(1);
  });
}
