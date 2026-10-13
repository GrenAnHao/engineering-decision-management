import { dirname, resolve } from 'node:path';

/** 编译成单体可执行文件后，模块位于内嵌虚拟文件系统：Windows 下为 B:\~BUN\…，其他平台为 /$bunfs/… */
export function isCompiled(moduleDir: string): boolean {
  return /^[A-Za-z]:[\\/]~BUN[\\/]/.test(moduleDir) || moduleDir.startsWith('/$bunfs/');
}

/** 应用目录（放 config.json 的地方）：编译后取 exe 所在目录，源码运行时取仓库根 */
export function resolveAppDir(moduleDir: string, execPath: string): string {
  return isCompiled(moduleDir) ? dirname(execPath) : resolve(moduleDir, '..', '..');
}
