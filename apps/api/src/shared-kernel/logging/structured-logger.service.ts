import type { LoggerService, LogLevel } from "@nestjs/common";
import { getLogContext } from "./log-context";
import { redact } from "./log-redaction";

type ParsedParams = Readonly<{ context?: string | undefined; trace?: string | undefined; meta?: readonly unknown[] | undefined }>;

type PlainError = Readonly<{ name: string; message: string; stack?: string }>;

/**
 * Hotfix observabilité staging (diagnostic Railway §POURQUOI LE LOGGER AFFICHE meta[0]: null) — un
 * `Error` natif JS n'expose `name`/`message`/`stack` que comme des propriétés NON énumérables :
 * `JSON.stringify(error)` (et `Object.entries()`, utilisé par `redact()` ci-dessous) les ignore
 * silencieusement et produit `{}`. C'est cette lacune qui, combinée au bug `parseOptionalParams`
 * corrigé plus bas, transformait toute exception de bootstrap NestJS (`ExceptionHandler.handle()`
 * appelle `logger.error(exception)` avec l'`Error` BRUTE comme unique argument) en
 * `{"message":{},"meta":[null]}` sur Railway — l'exception réelle était perdue avant même
 * d'atteindre les logs. Extraction EXPLICITE ici, jamais via le comportement par défaut de
 * `JSON.stringify`.
 */
function toPlainError(error: Error): PlainError {
  return { name: error.name, message: error.message, ...(typeof error.stack === "string" ? { stack: error.stack } : {}) };
}

/** Un `Error` devient un objet sérialisable (voir `toPlainError`) ; toute autre valeur — y compris
 *  `null`, `false`, une chaîne vide — traverse INCHANGÉE, jamais réécrite "au cas où". */
function normalizeLoggable(value: unknown): unknown {
  return value instanceof Error ? toPlainError(value) : value;
}

/**
 * Même heuristique que `ConsoleLogger` interne de Nest (jamais un comportement surprenant pour les
 * ~50 points d'appel `new Logger(X.name)` déjà existants, aucun n'a besoin d'être modifié) : le
 * DERNIER paramètre, s'il est une chaîne, est le `context` lié à l'instance `Logger` ; pour
 * `error()`, le premier paramètre restant (s'il est une chaîne) est la stack trace.
 *
 * Hotfix observabilité staging — Nest lui-même appelle `logger.error(exception, undefined, context)`
 * pour toute exception de bootstrap (`Logger.prototype.error`, padding interne quand
 * `optionalParams` est vide : `[undefined].concat(context)`) : cet `undefined` "technique" ne
 * satisfaisait ni le test `context` (dernier élément, déjà consommé) ni le test `trace` (pas une
 * chaîne), et restait égaré dans `meta` — `[undefined]`, sérialisé en `[null]` par `JSON.stringify`
 * (les tableaux JSON n'ont pas de "trou"). Filtré ici explicitement : un `undefined` isolé n'est
 * JAMAIS une métadonnée applicative réelle (le code applicatif qui veut logger "aucune valeur" logue
 * `null` ou omet l'argument), donc jamais silencieusement transformé en `null` visible. Une vraie
 * métadonnée (objet, `null` explicite, `false`, etc.) n'est jamais retirée.
 */
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
  const meta = params.map(normalizeLoggable).filter((value) => value !== undefined);
  return { context, trace, meta: meta.length > 0 ? meta : undefined };
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
    // Hotfix observabilité staging — un `Error` natif passé comme `message` (forme utilisée par
    // NestJS pour toute exception de bootstrap, voir `parseOptionalParams`) est explicitement
    // converti AVANT `redact()`, jamais laissé à `JSON.stringify` (qui le sérialiserait en `{}`).
    const normalizedMessage = normalizeLoggable(message);

    const line: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message: redact(normalizedMessage),
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
