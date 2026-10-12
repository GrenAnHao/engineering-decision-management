import type { BunRequest, Server } from 'bun';
import { HubError, type Hub, type ProjectPatch } from './hub';

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** 只接受本机 Host（防 DNS 重绑定）且 Origin 缺省或同源（防跨站写配置） */
export function isTrustedRequest(req: Request): boolean {
  const host = req.headers.get('host')?.toLowerCase();
  if (!host) return false;
  if (!LOCAL_HOSTNAMES.has(host.replace(/:\d+$/, ''))) return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

type Handler<P extends string> = (req: BunRequest<P>, server: Server<undefined>) => Response | Promise<Response>;

function guard<P extends string>(handler: Handler<P>): Handler<P> {
  return async (req, server) => {
    if (!isTrustedRequest(req)) return json({ error: '仅接受本机同源请求' }, 403);
    try {
      return await handler(req, server);
    } catch (err) {
      if (err instanceof HubError) return json({ error: err.message }, err.status);
      console.error('[api]', err);
      return json({ error: '服务器内部错误' }, 500);
    }
  };
}

async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HubError(400, '请求体必须是 JSON');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HubError(400, '请求体必须是 JSON 对象');
  return body as Record<string, unknown>;
}

export function parsePatch(body: Record<string, unknown>): ProjectPatch {
  const patch: ProjectPatch = {};
  if ('name' in body) {
    if (body.name !== null && typeof body.name !== 'string') throw new HubError(400, 'name 必须是字符串或 null');
    patch.name = body.name;
  }
  if ('hidden' in body) {
    if (typeof body.hidden !== 'boolean') throw new HubError(400, 'hidden 必须是布尔值');
    patch.hidden = body.hidden;
  }
  if (patch.name === undefined && patch.hidden === undefined) throw new HubError(400, '没有可更新的字段');
  return patch;
}

export function createApiRoutes(hub: Hub) {
  return {
    '/api/config': {
      GET: guard<'/api/config'>(() => json(hub.configResponse())),
    },
    '/api/projects': {
      POST: guard<'/api/projects'>(async (req) => {
        const body = await readJsonObject(req);
        if (typeof body.path !== 'string') throw new HubError(400, '缺少 path');
        return json(await hub.addProject(body.path), 201);
      }),
    },
    '/api/projects/:id': {
      PATCH: guard<'/api/projects/:id'>(async (req) =>
        json(await hub.patchProject(req.params.id, parsePatch(await readJsonObject(req)))),
      ),
      DELETE: guard<'/api/projects/:id'>(async (req) => {
        await hub.removeProject(req.params.id);
        return new Response(null, { status: 204 });
      }),
    },
    '/api/projects/:id/rescan': {
      POST: guard<'/api/projects/:id/rescan'>(async (req) => json(await hub.manualRescan(req.params.id))),
    },
    '/api/projects/:id/notes': {
      GET: guard<'/api/projects/:id/notes'>((req) => json(hub.notesResponse(req.params.id))),
    },
    '/api/projects/:id/notes/:noteId': {
      GET: guard<'/api/projects/:id/notes/:noteId'>((req) => json(hub.noteDetail(req.params.id, req.params.noteId))),
    },
    '/api/events': {
      GET: guard<'/api/events'>((req, server) => {
        server.timeout(req, 0);
        return hub.events.connect();
      }),
    },
  };
}
