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

/** 在临时目录起一套 Hub + API 服务（不挂前端），scanRoots 指向 root */
export async function startTestServer(
  setup: (root: string) => void,
  config: Record<string, unknown> = {},
): Promise<TestEnv> {
  const tmp = makeTempDir();
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
  const hub = new Hub({ configPath, heartbeatMs: 60_000 });
  await hub.start();
  const server = createServer({ hub, port: 0 });
  return {
    root,
    appDir,
    configPath,
    hub,
    base: `http://127.0.0.1:${server.port}`,
    close: () => {
      hub.stop();
      server.stop(true);
      tmp.cleanup();
    },
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
