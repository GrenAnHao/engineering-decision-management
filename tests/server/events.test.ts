import { afterEach, expect, test } from 'bun:test';
import { Broadcaster, formatEvent } from '../../src/server/events';

let hub: Broadcaster | null = null;
afterEach(() => {
  hub?.close();
  hub = null;
});

const decoder = new TextDecoder();

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read();
  return decoder.decode(value);
}

test('formatEvent 输出标准 SSE 帧', () => {
  expect(formatEvent('project-error', { id: 'Pi', reason: 'x' })).toBe(
    'event: project-error\ndata: {"id":"Pi","reason":"x"}\n\n',
  );
});

test('connect 首帧为 connected，响应头禁止缓存', async () => {
  hub = new Broadcaster(60_000);
  const res = hub.connect();
  expect(res.headers.get('Content-Type')).toStartWith('text/event-stream');
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  const first = await readChunk(res.body!.getReader());
  expect(first).toStartWith('event: connected\ndata: {"clientId":"');
  expect(hub.size).toBe(1);
});

test('broadcast 推送给所有客户端', async () => {
  hub = new Broadcaster(60_000);
  const a = hub.connect().body!.getReader();
  const b = hub.connect().body!.getReader();
  await readChunk(a);
  await readChunk(b);
  hub.broadcast('project-error', { id: 'Pi', reason: '路径失效' });
  expect(await readChunk(a)).toContain('event: project-error');
  expect(await readChunk(b)).toContain('路径失效');
});

test('按间隔发送 keepalive 注释行', async () => {
  hub = new Broadcaster(30);
  const reader = hub.connect().body!.getReader();
  await readChunk(reader);
  expect(await readChunk(reader)).toBe(': keepalive\n\n');
});

test('客户端取消后从列表移除', async () => {
  hub = new Broadcaster(60_000);
  const reader = hub.connect().body!.getReader();
  await readChunk(reader);
  await reader.cancel();
  expect(hub.size).toBe(0);
});
