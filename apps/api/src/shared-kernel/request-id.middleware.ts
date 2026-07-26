import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export type RequestWithId = Request & { id?: string };

/**
 * Propage un identifiant de corrélation par requête
 * (skills/platform-foundation/API_PATTERNS.md §28).
 */
export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();

  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}
