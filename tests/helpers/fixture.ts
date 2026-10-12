import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** 在系统临时目录建一个工作区，测试结束调用 cleanup 删除 */
export function makeTempDir(prefix = 'edm-'): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** 写入一组相对路径 → 内容的文件 */
export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

/** 在 root 下建一个含 .agents/notes 的项目，notes 的键是相对 notes 根的路径 */
export function makeProject(root: string, name: string, notes: Record<string, string>): string {
  const projectDir = join(root, name);
  mkdirSync(join(projectDir, '.agents', 'notes'), { recursive: true });
  writeFiles(join(projectDir, '.agents', 'notes'), notes);
  return projectDir;
}

export function note(title: string, status = 'implemented', body = '## Problem\n\np\n\n## Decision\n\nd\n'): string {
  return `# Agent Note: ${title}\n\nStatus: ${status}\n\n${body}`;
}
