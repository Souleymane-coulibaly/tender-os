import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Sprint 21 (hardening) — mission §51 (correlation ID par requête, propagé "si raisonnable" aux
 * jobs/Outbox/appels fournisseur). `AsyncLocalStorage` propage automatiquement cette valeur à
 * travers toute la chaîne d'appels asynchrones déclenchée DANS une requête HTTP (use cases,
 * repositories, appels fournisseur) — sans avoir à faire passer `requestId` en paramètre explicite
 * de chaque fonction existante, ni à toucher les ~50 points d'appel `new Logger(...)` déjà présents
 * dans le codebase (mission "rester léger", jamais une réécriture massive).
 *
 * Portée volontairement limitée à UNE requête HTTP : un worker en arrière-plan (Outbox/Analysis/...)
 * tourne HORS de tout store actif (`getStore()` renvoie `undefined`) — c'est un choix délibéré,
 * jamais un bug : un tick de worker n'a pas de "requête" à corréler, et les logs applicatifs de ces
 * workers portent déjà leurs propres identifiants métier (jobId, eventId...).
 */
export type LogContext = Readonly<{
  requestId: string;
  organizationId?: string | undefined;
  userId?: string | undefined;
}>;

const storage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getLogContext(): LogContext | undefined {
  return storage.getStore();
}
