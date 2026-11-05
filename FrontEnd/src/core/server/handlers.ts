import type { AppConfig } from './config';
import { actorOf, assertTrustedWrite, json, readJson } from './http';
import { moduleService, opOf } from './module-service';

export async function moduleView(req: Request, cfg: AppConfig, id: string): Promise<Response> {
  return json(await moduleService(cfg, id).view(actorOf(req)));
}

export async function moduleChange(req: Request, cfg: AppConfig, id: string, table: string): Promise<Response> {
  assertTrustedWrite(req, cfg);
  const op = opOf(req.method);
  const input = await readJson(req);
  return json(await moduleService(cfg, id).change(actorOf(req), table, op, input.rows));
}

export async function moduleQuery(req: Request, cfg: AppConfig, id: string, table: string): Promise<Response> {
  // POST so the query is a JSON body (not in URLs) and the write guard applies; it changes nothing.
  assertTrustedWrite(req, cfg);
  return json(await moduleService(cfg, id).query(actorOf(req), table, await readJson(req)));
}
