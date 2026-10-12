import { afterEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { createServer } from '../../src/server/app';
import { Hub } from '../../src/server/hub';
import { makeTempDir } from '../helpers/fixture';

let cleanup = () => {};
afterEach(() => cleanup());

test('端口已被占用时 createServer 抛 EADDRINUSE（不允许重复绑定）', async () => {
  const tmp = makeTempDir();
  const hub = new Hub({ configPath: join(tmp.dir, 'config.json'), heartbeatMs: 60_000 });
  const first = createServer({ hub, port: 0 });
  cleanup = () => {
    first.stop(true);
    hub.stop();
    tmp.cleanup();
  };
  let error: (Error & { code?: string }) | null = null;
  try {
    createServer({ hub, port: first.port as number }).stop(true);
  } catch (err) {
    error = err as Error & { code?: string };
  }
  expect(error?.code).toBe('EADDRINUSE');
});
