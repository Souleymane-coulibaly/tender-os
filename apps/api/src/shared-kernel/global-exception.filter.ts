import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "./domain-error";
import type { RequestWithId } from "./request-id.middleware";

/**
 * Sprint 21 (hardening) — filet de sécurité global (mission §60/§92/skills/platform-foundation/
 * API_PATTERNS.md §13-14). Chaque module possède déjà son propre filtre `@Catch(DomainError)`
 * scopé via `@UseFilters` sur son contrôleur (ex: `IdentityErrorFilter`) — Nest choisit toujours
 * le filtre le PLUS spécifique qui matche le type de l'exception ; ce filtre `@Catch()` (sans
 * argument, donc "attrape tout") n'intervient QUE quand aucun filtre plus spécifique n'a matché :
 *   - une `DomainError` levée par un module qui n'a pas (encore) son propre filtre de traduction ;
 *   - une `BadRequestException` de `ZodValidationPipe` (déjà dans l'enveloppe canonique, mais sans
 *     `requestId` — jamais construit avec la connaissance de la requête HTTP) ;
 *   - toute autre `HttpException` levée directement (ex: un Guard RBAC) sans passer par un module ;
 *   - un bug réel, une erreur Prisma non traduite, etc. — jamais de stack trace ni de détail
 *     interne renvoyé au client, toujours un `requestId` pour permettre le rapprochement avec les
 *     logs serveur (mission §60 : "ne jamais exposer la stack trace en production").
 * Enregistré globalement via `APP_FILTER` (shared-kernel.module.ts) plutôt que dans main.ts —
 * garantit son application même aux routes qui n'ont pas encore de filtre dédié.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request.id;

    if (exception instanceof DomainError) {
      this.logger.warn(
        `DomainError "${exception.code}" reached the global filter unmapped — this route's module should register its own error filter.`,
      );
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: { code: exception.code, message: exception.message, requestId },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const { code, message } = normalizeHttpExceptionBody(exception.getResponse(), status, exception.message);
      response.status(status).json({ error: { code, message, requestId } });
      return;
    }

    this.logger.error(
      `Unhandled exception on ${request.method} ${request.originalUrl}: ${exception instanceof Error ? exception.stack : String(exception)}`,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred.", requestId },
    });
  }
}

function normalizeHttpExceptionBody(
  body: unknown,
  status: HttpStatus,
  fallbackMessage: string,
): { code: string; message: string } {
  const defaultCode = HttpStatus[status] ?? "HTTP_ERROR";

  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;

    // Enveloppe déjà canonique (ex: ZodValidationPipe — skills/platform-foundation/API_PATTERNS.md
    // §22) : `{ error: { code, message, ... } }`, il ne manque que le `requestId`.
    if (typeof record.error === "object" && record.error !== null) {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.code === "string" && typeof nested.message === "string") {
        return { code: nested.code, message: nested.message };
      }
    }

    // Forme par défaut de Nest ({ statusCode, message, error }) pour une HttpException levée
    // directement (ex: un Guard) sans jamais avoir été volontairement enveloppée par un module.
    if (typeof record.message === "string") {
      return { code: defaultCode, message: record.message };
    }
    if (Array.isArray(record.message) && record.message.every((entry) => typeof entry === "string")) {
      return { code: defaultCode, message: (record.message as string[]).join(" ") };
    }
  }

  return { code: defaultCode, message: fallbackMessage };
}
