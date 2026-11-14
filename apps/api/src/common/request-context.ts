import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type ActorRole = 'DONOR' | 'CHARITY' | 'ADMIN' | 'SYSTEM' | 'ANONYMOUS';

export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  actorUserId?: string;
  actorRole: ActorRole;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Current request context, or a SYSTEM context for background jobs. */
export function currentContext(): RequestContext {
  return storage.getStore() ?? { requestId: 'system', actorRole: 'SYSTEM' };
}

/** Run code (e.g. a BullMQ job) under an explicit context. */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Called by the auth guard once the JWT is verified. */
export function setActor(userId: string, role: ActorRole) {
  const store = storage.getStore();
  if (store) {
    store.actorUserId = userId;
    store.actorRole = role;
  }
}

/** Express middleware: opens a context for every HTTP request. */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', requestId);
  storage.run(
    {
      requestId,
      ip: req.ip,
      userAgent: req.header('user-agent')?.slice(0, 300),
      actorRole: 'ANONYMOUS',
    },
    next,
  );
}
