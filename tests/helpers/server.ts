import { setDefaultTimeout } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from '../../src/server/app';
import { Hub } from '../../src/server/hub';
import { makeTempDir } from './fixture';

export type TestEnv = {
  root: string;
  appDir: string;
  configPath: string;
  hub: Hub;
  base: string;
  close: () => void;
};

/**
 * 把当前测试文件的单用例超时放宽到 20 s：e2e 用例内部会等待最长约 15 s 的文件事件与 SSE，
 * 默认 5 s 会在高负载下误杀。bunfig.toml 的 [test] 不支持 timeout，而 setDefaultTimeout
 * 按测试文件生效，所以每个用到测试服务的文件顶部都要调用一次。
 */
export function useServerTestTimeout(): void {
  setDefaultTimeout(20_000);
}

const live = new Set<() => void>();

/** 关闭所有尚未关闭的测试服务（在 afterEach 中调用，覆盖用例超时导致 env 未赋值的情况） */
export function closeAllTestServers(): void {
  for (const close of [...live]) close();
}

/** 在临时目录起一套 Hub + API 服务（不挂前端），scanRoots 指向 root */
export async function startTestServer(
  setup: (root: string) => void,
  config: Record<string, unknown> = {},
): Promise<TestEnv> {
  const tmp = makeTempDir();
  let hub: Hub | null = null;
  let server: ReturnType<typeof createServer> | null = null;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    live.delete(close);
    hub?.stop();
    server?.stop(true);
    tmp.cleanup();
  };
  live.add(close);
  const root = join(tmp.dir, 'root');
  const appDir = join(tmp.dir, 'app');
  mkdirSync(root, { recursive: true });
  mkdirSync(appDir, { recursive: true });
  setup(root);
  const configPath = join(appDir, 'config.json');
  writeFileSync(
    configPath,
    JSON.stringify({ scanRoots: [root], scanDepth: 2, projects: [], watch: { debounceMs: 50, rescanRootsMs: 0 }, ...config }),
  );
  hub = new Hub({ configPath, heartbeatMs: 60_000 });
  await hub.start();
  server = createServer({ hub, port: 0 });
  return {
    root,
    appDir,
    configPath,
    hub,
    base: `http://127.0.0.1:${server.port}`,
    close,
  };
}

/** 读 SSE 流直到出现满足条件的事件，超时抛错 */
export async function waitForEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  match: (event: string, data: unknown) => boolean,
  timeoutMs = 5000,
): Promise<{ event: string; data: unknown }> {
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<null>((r) => setTimeout(() => r(null), deadline - Date.now())),
    ]);
    if (!chunk || chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = /^event: (.+)$/m.exec(frame)?.[1];
      const data = /^data: (.+)$/m.exec(frame)?.[1];
      if (event && data) {
        const parsed = JSON.parse(data);
        if (match(event, parsed)) return { event, data: parsed };
      }
    }
  }
  throw new Error('等待 SSE 事件超时');
}
