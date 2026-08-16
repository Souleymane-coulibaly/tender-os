import { Counter, Gauge, Histogram, Registry } from "prom-client";

/**
 * Sprint 21 (hardening) — mission §57/§58/§59 : "réutiliser une librairie de métriques légère
 * plutôt que d'écrire un système maison" + "PAS D'INFRA LOURDE INUTILE" (jamais de déploiement
 * Prometheus/Grafana dans ce sprint — seulement exposer les bons signaux, la décision d'infra se
 * prend au déploiement). `prom-client` est une simple bibliothèque de comptage en mémoire, pas une
 * infrastructure : un `Registry` process-local, exposé en texte via `GET /metrics`
 * (metrics.controller.ts).
 *
 * Singleton simple exporté directement (PAS de service NestJS entre les métriques et leurs points
 * d'incrémentation) : plusieurs points d'appel réels (workers construits par `new` dans des
 * fonctions utilitaires comme `provider-http-client.ts`, `DefaultAIProviderRegistry.resolve()`) ne
 * passent pas par l'injection de dépendances Nest — un import direct évite un contournement DI
 * artificiel juste pour incrémenter un compteur.
 */
export const metricsRegistry = new Registry();

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total des requêtes HTTP reçues, par méthode/route/statut.",
  labelNames: ["method", "route", "status"],
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "Durée des requêtes HTTP en secondes, par méthode/route/statut.",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

export const httpErrorsTotal = new Counter({
  name: "http_errors_total",
  help: "Total des réponses HTTP en erreur serveur (>= 500), par méthode/route/statut.",
  labelNames: ["method", "route", "status"],
  registers: [metricsRegistry],
});

export const dbQueryDurationSeconds = new Histogram({
  name: "db_query_duration_seconds",
  help: "Durée des requêtes Prisma en secondes (toutes confondues — jamais le texte SQL, voir prisma.service.ts).",
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

/** Gauges calculées à la lecture (`metrics.controller.ts`), jamais tenues à jour par
 *  incrémentation en mémoire : la profondeur de file Outbox est un état global partagé entre
 *  toutes les instances, une valeur "vraie" au moment du scrape est plus fiable qu'un compteur
 *  local à un seul process (mission PARTIE F — sécurité multi-instance). */
export const outboxPending = new Gauge({
  name: "outbox_pending",
  help: "Nombre actuel d'OutboxEvent non encore publiés avec succès (PENDING/PROCESSING/FAILED).",
  registers: [metricsRegistry],
});

export const outboxDeadLetter = new Gauge({
  name: "outbox_dead_letter",
  help: "Nombre actuel d'événements en dead-letter (jamais purgés automatiquement).",
  registers: [metricsRegistry],
});

export const workerJobsTotal = new Counter({
  name: "worker_jobs_total",
  help: "Total des issues de traitement par worker, par nom de worker et issue (succeeded/failed/dead_letter).",
  labelNames: ["worker", "outcome"],
  registers: [metricsRegistry],
});

export const workerJobsFailed = new Counter({
  name: "worker_jobs_failed",
  help: "Total des échecs de traitement par worker, par nom de worker.",
  labelNames: ["worker"],
  registers: [metricsRegistry],
});

export const aiRequestsTotal = new Counter({
  name: "ai_requests_total",
  help: "Total des appels au provider IA, par provider et issue (succeeded/failed) — jamais le contenu du prompt/de la réponse.",
  labelNames: ["provider", "outcome"],
  registers: [metricsRegistry],
});

export const integrationRequestsFailed = new Counter({
  name: "integration_requests_failed",
  help: "Total des requêtes sortantes en échec vers un provider d'intégration externe, par provider.",
  labelNames: ["provider"],
  registers: [metricsRegistry],
});

/** P2 (audit Codex, Resend/Demo Request) — observabilité minimale demandée par la mission :
 *  distingue un email de demande de démo réellement envoyé d'un échec, sans exposer le contenu du
 *  message ni aucun secret (label `outcome` uniquement, même motif que `workerJobsTotal`). */
export const demoRequestEmailTotal = new Counter({
  name: "demo_request_email_total",
  help: "Total des tentatives d'envoi de l'email de notification de demande de démo, par issue (sent/failed).",
  labelNames: ["outcome"],
  registers: [metricsRegistry],
});
