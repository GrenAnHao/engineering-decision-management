import type { HubEventMap, HubEventName } from '../shared/types';

const encoder = new TextEncoder();

/** 客户端积压超过这么多块（不读）就断开，交给 EventSource 自动重连 */
const MAX_BACKLOG = 64;

export function formatEvent<K extends HubEventName>(event: K, data: HubEventMap[K]): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** SSE 广播器：维护客户端流，定时发注释行心跳防中间层断连 */
export class Broadcaster {
  private readonly clients = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(heartbeatMs = 15_000) {
    this.heartbeat = setInterval(() => this.send(': keepalive\n\n'), heartbeatMs);
  }

  get size(): number {
    return this.clients.size;
  }

  /** 建立一条 SSE 流，首帧发送 connected。调用方须先对该请求关闭空闲超时（server.timeout(req, 0)）。 */
  connect(): Response {
    if (this.closed) return new Response('服务正在关闭', { status: 503 });
    const clientId = crypto.randomUUID();
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.clients.set(clientId, controller);
        controller.enqueue(encoder.encode(formatEvent('connected', { clientId })));
      },
      cancel: () => {
        this.clients.delete(clientId);
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      },
    });
  }

  broadcast<K extends HubEventName>(event: K, data: HubEventMap[K]): void {
    this.send(formatEvent(event, data));
  }

  close(): void {
    this.closed = true;
    clearInterval(this.heartbeat);
    for (const controller of this.clients.values()) {
      try {
        controller.close();
      } catch {
        // 流已被客户端关闭
      }
    }
    this.clients.clear();
  }

  private send(chunk: string): void {
    const bytes = encoder.encode(chunk);
    for (const [id, controller] of this.clients) {
      if ((controller.desiredSize ?? 0) < -MAX_BACKLOG) {
        this.clients.delete(id);
        try {
          controller.close();
        } catch {
          // 流已关闭
        }
        continue;
      }
      try {
        controller.enqueue(bytes);
      } catch {
        this.clients.delete(id);
      }
    }
  }
}
