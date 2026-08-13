import type { LoggerService, LogLevel } from "@nestjs/common";
import { getLogContext } from "./log-context";
import { redact } from "./log-redaction";

type ParsedParams = Readonly<{ context?: string | undefined; trace?: string | undefined; meta?: readonly unknown[] | undefined }>;

/** Même heuristique que `ConsoleLogger` interne de Nest (jamais un comportement surprenant pour les
 *  ~50 points d'appel `new Logger(X.name)` déjà existants, aucun n'a besoin d'être modifié) : le
 *  DERNIER paramètre, s'il est une chaîne, est le `context` lié à l'instance `Logger` ; pour
 *  `error()`, le premier paramètre restant (s'il est une chaîne) est la stack trace. */
function parseOptionalParams(optionalParams: unknown[]): ParsedParams {
  const params = [...optionalParams];
  let context: string | undefined;
  if (params.length > 0 && typeof params[params.length - 1] === "string") {
    context = params.pop() as string;
  }
  let trace: string | undefined;
  if (params.length > 0 && typeof params[0] === "string") {
    trace = params.shift() as string;
  }
  return { context, trace, meta: params.length > 0 ? params : undefined };
}

/**
 * Sprint 21 (hardening) — mission §49/§50/§51/§52 : sortie JSON structurée (timestamp/level/
 * requestId-correlationId/organizationId/userId/module/operation/error-code, jamais de secret —
 * voir `log-redaction.ts`) plutôt que le texte libre par défaut de Nest. Branché globalement via
 * `app.useLogger(...)` (main.ts) : chaque `new Logger(X.name)` déjà existant dans le codebase (~50
 * points d'appel) continue de fonctionner à l'identique côté appelant, seul le FORMAT de sortie
 * change — mission "rester léger", jamais une réécriture des call sites existants.
 *
 * `requestId`/`organizationId`/`userId` proviennent de `AsyncLocalStorage` (`log-context.ts`),
 * jamais d'un paramètre explicite — `undefined` pour tout code exécuté hors d'une requête HTTP
 * (workers en arrière-plan), ce qui est attendu, pas une erreur de câblage.
 */
export class StructuredLoggerService implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write("log", message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write("warn", message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write("verbose", message, optionalParams);
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    const { context, trace, meta } = parseOptionalParams(optionalParams);
    const logContext = getLogContext();

    const line: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message: typeof message === "string" ? redact(message) : redact(message),
      module: context,
      requestId: logContext?.requestId,
      organizationId: logContext?.organizationId,
      userId: logContext?.userId,
    };
    if (trace) line.trace = redact(trace);
    if (meta) line.meta = redact(meta);

    // Jamais `undefined` dans la sortie JSON (JSON.stringify les omet déjà nativement, mais un
    // filtrage explicite garde la ligne lisible pour un humain qui la lit brute en développement).
    const output = JSON.stringify(line, (_key, value) => (value === undefined ? undefined : value));

    // stderr pour error/warn (convention standard, permet de séparer les flux en production),
    // stdout pour le reste — jamais `console.log` nu (mission "niveaux de log corrects").
    if (level === "error" || level === "warn") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  }
}
