import { type CallHandler, type ExecutionContext, HttpStatus, Injectable, type NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { catchError, tap, throwError } from "rxjs";
import { httpErrorsTotal, httpRequestDurationSeconds, httpRequestsTotal } from "./metrics";

/**
 * Sprint 21 (hardening) — mission §57 (http_requests_total/http_request_duration/http_errors_total).
 * Enregistré globalement (shared-kernel.module.ts, APP_INTERCEPTOR) : couvre toutes les routes sans
 * instrumentation par module. Le `route` utilisé pour le label est le PATTERN de route Nest
 * (`req.route.path`, ex. "/tenders/:id"), jamais l'URL brute — une URL brute contiendrait des UUID
 * réels et exploserait la cardinalité des séries de métriques (une série par Tender au lieu d'une
 * série par endpoint).
 */
@Injectable()
export class MetricsHttpInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler["handle"]> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const startedAtNs = process.hrtime.bigint();
    const method = request.method;

    const record = (status: number): void => {
      const route = resolveRouteLabel(request);
      const durationSeconds = Number(process.hrtime.bigint() - startedAtNs) / 1e9;
      const labels = { method, route, status: String(status) };
      httpRequestsTotal.inc(labels);
      httpRequestDurationSeconds.observe(labels, durationSeconds);
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        httpErrorsTotal.inc(labels);
      }
    };

    return next.handle().pipe(
      tap(() => record(response.statusCode)),
      catchError((error: unknown) => {
        const status = error instanceof Error && "getStatus" in error && typeof (error as { getStatus: unknown }).getStatus === "function" ? (error as { getStatus: () => number }).getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
        record(status);
        return throwError(() => error);
      }),
    );
  }
}

function resolveRouteLabel(request: Request): string {
  const routePath = (request as Request & { route?: { path?: string } }).route?.path;
  if (typeof routePath === "string" && routePath.length > 0) {
    return `${request.baseUrl ?? ""}${routePath}`;
  }
  return "unmatched";
}
