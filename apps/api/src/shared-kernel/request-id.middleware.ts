import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { runWithLogContext } from "./logging/log-context";

export type RequestWithId = Request & { id?: string };

/**
 * Propage un identifiant de corrélation par requête
 * (skills/platform-foundation/API_PATTERNS.md §28).
 *
 * Sprint 21 (hardening) — mission §51 : `runWithLogContext` établit le contexte
 * `AsyncLocalStorage` lu par `StructuredLoggerService` (log-context.ts/structured-logger.service.ts)
 * pour toute la durée de CETTE requête (tout code asynchrone déclenché depuis `next()` en hérite
 * automatiquement) — chaque ligne de log produite pendant le traitement porte désormais le même
 * `requestId` que l'en-tête `X-Request-Id` déjà renvoyé au client, sans modifier un seul des points
 * d'appel `new Logger(...)` déjà existants dans le codebase.
 */
export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();

  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);
  runWithLogContext({ requestId }, next);
}
