# TenderOS — Runbook d'exploitation

> Sprint 21 (hardening). Documente l'état RÉEL du système tel qu'implémenté à ce sprint — jamais un
> objectif futur ou une certification de conformité. À maintenir à jour à chaque sprint qui modifie
> le comportement décrit ici.

## 1. Démarrage de l'application

### 1.1 Variables d'environnement obligatoires (l'application refuse de démarrer sans elles)

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion Postgres |
| `AUTH_SECRET` | Signature des sessions |
| Configuration DCE (`DceModule`) | Voir `apps/api/src/modules/dce/infrastructure/dce-config.ts` |
| Configuration Extraction (`ExtractionModule`) | Voir `apps/api/src/modules/extraction/infrastructure/extraction-config.ts` |

Un échec de l'une de ces variables fait échouer `assertRequiredEnv()` dans `apps/api/src/main.ts`
AVANT même la construction du graphe de dépendances Nest — le process ne démarre jamais dans un
état à moitié configuré.

### 1.2 Variables optionnelles (fonctionnalité désactivée/dégradée si absentes, jamais un crash)

| Domaine | Variables | Comportement si absent |
|---|---|---|
| IA (Analysis/Generation/Chat) | `AI_PROVIDER`, `OPENAI_API_KEY`, `AI_MODEL*`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES` | Toute tentative d'analyse/génération échoue avec `AI_PROVIDER_NOT_CONFIGURED` — l'application démarre normalement |
| Métriques | `METRICS_TOKEN` | `/metrics` reste accessible sans authentification si absent (acceptable en développement/réseau privé — voir §3 de ce document pour la posture recommandée en production) |
| Email (Resend) | voir module `notifications` | Envoi d'email désactivé, les autres flux métier continuent (mission §68-70 — jamais un email raté qui annule une transaction métier) |
| Connecteurs Microsoft/Google | credentials OAuth par organisation | Fonctionnalité `NOT_CONFIGURED`, jamais un crash au démarrage |

### 1.3 Workers en arrière-plan démarrés automatiquement

Chaque worker suit le même motif : `onModuleInit()` démarre un `setInterval` non bloquant
(`.unref()`), `onModuleDestroy()` l'arrête proprement (voir §1.4 pour l'arrêt gracieux). Tous sont
désactivables individuellement via une variable d'environnement `*_ENABLED=false` — utile pour
isoler un problème en production sans redéployer.

| Worker | Rôle | Intervalle par défaut | Variable ENABLED |
|---|---|---|---|
| `OutboxPublisherWorker` | Publie les événements Outbox vers leurs handlers | 2 s | `OUTBOX_WORKER_ENABLED` |
| `WebhookDeliveryWorker` | Livre les webhooks sortants | 2 s | `WEBHOOK_DELIVERY_WORKER_ENABLED` |
| `EmailAlertWorker` | Envoie les alertes de veille marché par email | 5 min | `EMAIL_ALERT_WORKER_ENABLED` |
| `MarketSourceSyncWorker` | Synchronise les sources de marchés publics (BOAMP...) | 1 h | `MARKET_SOURCE_SYNC_WORKER_ENABLED` |
| `AnalysisJobStaleRecoveryWorker` (Sprint 21) | Reprend un job d'analyse resté bloqué `PROCESSING` (crash process) | 5 min | `ANALYSIS_STALE_RECOVERY_WORKER_ENABLED` |
| `GenerationStaleRecoveryWorker` (Sprint 21) | Reprend une génération restée bloquée `GENERATING` | 5 min | `GENERATION_STALE_RECOVERY_WORKER_ENABLED` |
| `ChatStalePendingRecoveryWorker` (Sprint 21) | Débloque un message assistant resté bloqué `PENDING` | 2 min | `CHAT_STALE_RECOVERY_WORKER_ENABLED` |

### 1.4 Arrêt gracieux

`app.enableShutdownHooks()` (main.ts) permet à Nest d'écouter `SIGTERM`/`SIGINT` (envoyé par
Railway lors d'un redéploiement) et d'exécuter les hooks `onModuleDestroy()` de chaque worker
(arrêt des timers) et de `PrismaService.$disconnect()` avant que le process ne soit tué. Sans cet
appel, un redéploiement interromprait les workers en plein tick et fermerait la connexion Postgres
brutalement.

## 2. Vérifier que l'application est en bonne santé

| Endpoint | Usage | Dépend de |
|---|---|---|
| `GET /health` | Liveness — "le process est vivant" | Rien — jamais la base de données (un pod ne doit jamais être recyclé juste parce que Postgres est temporairement injoignable) |
| `GET /health/live` | Alias strict de `/health` | Rien |
| `GET /health/ready` | Readiness — "prêt à recevoir du trafic" | Postgres uniquement (`SELECT 1`) — retourne 503 si injoignable. Ne vérifie JAMAIS Microsoft/Google/IA/email : ces providers optionnels peuvent être DEGRADED sans jamais faire tomber la readiness de TenderOS |

Les deux endpoints sont hors du préfixe `/api/v1` (contrat d'infrastructure fixe) et jamais
authentifiés (nécessaire pour un load-balancer/uptime-monitor).

## 3. Métriques

`GET /metrics` — format d'exposition Prometheus (texte), hors `/api/v1`. Voir
`apps/api/src/shared-kernel/metrics/metrics.ts` pour la liste exhaustive des métriques exposées :

- `http_requests_total`, `http_request_duration_seconds`, `http_errors_total` — toute requête HTTP (label `route` = pattern Nest, jamais l'URL brute — évite l'explosion de cardinalité).
- `db_query_duration_seconds` — toute requête Prisma (durée uniquement, jamais le texte SQL).
- `worker_jobs_total{worker,outcome}`, `worker_jobs_failed{worker}` — chaque tick de chaque worker (labels `worker` : `outbox`, `webhook_delivery`, `email_alert`, `market_source_sync`, `analysis_stale_recovery`, `generation_stale_recovery`, `chat_stale_recovery`).
- `outbox_pending`, `outbox_dead_letter` — gauges calculées EN DIRECT à chaque scrape (comptage SQL, jamais un compteur en mémoire — la profondeur de file est un état global, pas un état par process).
- `ai_requests_total{provider,outcome}` — chaque appel réel à un provider IA (Analysis/Generation/Chat partagent le même point d'instrumentation, `DefaultAIProviderRegistry`).
- `integration_requests_failed{provider}` — chaque appel sortant en échec vers Microsoft/Google (`provider-http-client.ts`).

**Protection** : si `METRICS_TOKEN` est configuré, l'endpoint exige l'en-tête
`X-Metrics-Token: <valeur>` (401 sinon). **Dès que `NODE_ENV=production`, `METRICS_TOKEN` devient de
fait requis** — son absence fait refuser la requête (401), jamais un accès ouvert par défaut en
production (correctif réaudit externe). Hors production (développement/test), l'absence de jeton
laisse l'endpoint ouvert. Ce n'est pas une donnée métier sensible (uniquement des compteurs
agrégés), mais elle révèle des informations opérationnelles (taux d'erreur, volumes).

Aucune infrastructure de scraping/dashboard n'est déployée par TenderOS lui-même (mission "pas
d'infra lourde inutile") — Prometheus/Grafana/équivalent est une décision à prendre au moment du
déploiement, pas ce sprint.

## 4. Logs

Depuis le Sprint 21, la sortie est JSON structuré (`StructuredLoggerService`,
`apps/api/src/shared-kernel/logging/`) : `{timestamp, level, message, module, requestId,
organizationId, userId, trace?, meta?}`. `error`/`warn` sur stderr, le reste sur stdout. Rédaction
automatique des secrets connus (Authorization, cookies, clés API, tokens OAuth, secrets de webhook —
voir `log-redaction.ts`) — jamais une garantie absolue contre TOUT nouveau type de secret, seulement
les motifs connus à ce jour.

`requestId` est propagé automatiquement (via `AsyncLocalStorage`, `log-context.ts`) à tout code
exécuté PENDANT une requête HTTP, y compris les appels asynchrones en aval — permet de retrouver
toutes les lignes de log d'une requête donnée en filtrant sur ce champ. Un worker en arrière-plan
n'a pas de `requestId` (`undefined`) — c'est attendu, pas une erreur de câblage : ces workers ont
leurs propres identifiants métier dans leurs messages (jobId, eventId...).

Pour diagnostiquer un incident signalé par un utilisateur : demander le `requestId` (renvoyé dans
l'en-tête de réponse `X-Request-Id`, et dans le corps de toute erreur `{error:{code, message,
requestId}}`), filtrer les logs sur ce champ.

## 5. Outbox — file d'événements asynchrone

Tout événement métier (Tender créé, document généré, mention...) passe par la table `outbox_events`
avant d'être livré à son(ses) handler(s) (notifications, intégrations). Statuts :
`PENDING → PROCESSING → PUBLISHED`, ou `PENDING/PROCESSING → FAILED` (retry avec backoff exponentiel
+ jitter) `→ DEAD_LETTER` après épuisement des tentatives.

- **Visibilité dead-letter** (Sprint 21) : `GET /admin/outbox/dead-letters` (Platform Admin,
  capacité `MetricsRead`) — liste paginée par curseur, filtrable par organisation, sans jamais
  exposer le `payload` brut (potentiellement volumineux/sensible) dans la vue liste.
- **Idempotence des consommateurs** (Sprint 21) : chaque événement n'est traité QU'UNE FOIS par
  consommateur (`ProcessedEvent`, contrainte unique `(outboxEventId, consumerName)`) — une
  redélivraison (bail expiré, crash worker) ne réexécute jamais l'effet de bord (email envoyé deux
  fois, notification dupliquée). Câblé au niveau du dispatcher central
  (`CompositeOutboxEventDispatcher`), donc valable pour TOUS les handlers (intégrations et
  notifications), présents et futurs.
- **Reprise après crash** : `claimPendingBatch` reprend automatiquement un événement resté
  `PROCESSING` au-delà de `OUTBOX_STALE_PROCESSING_THRESHOLD_MS` (5 min par défaut) — via
  `SELECT...FOR UPDATE SKIP LOCKED`, sûr en déploiement multi-instance.

## 6. Reprise des jobs bloqués (Sprint 21)

Trois mécanismes symétriques, un par domaine, tous avec le même principe (candidat détecté par
lecture simple hors verrou, revérifié sous verrou/lecture fraîche avant mutation) :

| Domaine | État bloqué détecté | Seuil par défaut | Action |
|---|---|---|---|
| `AnalysisJob` | `PROCESSING` au-delà du seuil | 10 min (`ANALYSIS_STALE_PROCESSING_THRESHOLD_MS`) | Retour à `QUEUED`, re-déclenché automatiquement via le dispatcher |
| `Generation` | `GENERATING` au-delà du seuil | 10 min (`GENERATION_STALE_THRESHOLD_MS`) | Retour à `PENDING`, re-déclenché automatiquement |
| `Message` (Chat) | `PENDING` au-delà du seuil | 2 min (`CHAT_STALE_PENDING_THRESHOLD_MS`) | Passe à `FAILED` avec un message explicite — PAS de re-déclenchement automatique (Chat est synchrone à tentative unique, l'utilisateur renvoie sa question s'il le souhaite) |

`attemptCount` n'est jamais réinitialisé par une reprise automatique — la tentative interrompue
reste comptée (protège contre une boucle de reprise infinie combinée à un plafond de retry, voir
`assertAnalysisIsRetryable`/`assertGenerationIsRetryable`).

## 7. Intégrations externes (Microsoft/Google)

Chaque appel sortant passe par `callProviderJson`/`callProviderBinary`
(`provider-http-client.ts`) — timeout 15 s, jusqu'à 3 tentatives sur erreur transitoire
(429/5xx/timeout réseau) avec backoff, jamais de retry sur une erreur permanente
(401/403/404/409/400/422). `RemoteProviderError.isAmbiguousOutcome` distingue un échec réseau AVANT
réception d'une réponse (le provider a peut-être quand même traité la requête) d'un échec avec
réponse HTTP reçue — `retryAmbiguous: false` DOIT être passé pour toute opération d'écriture non
idempotente (upload, création d'événement calendrier) pour ne jamais dupliquer côté provider.

## 8. Base de données

- Pool de connexions : configuration Prisma par défaut, dimensionnée pour l'environnement de
  déploiement — ne jamais fixer un pool surdimensionné arbitrairement (voir DATABASE_DESIGN.md).
- Index : voir `DATABASE_DESIGN.md` pour la liste par module. Sprint 21 a ajouté deux index
  cross-organisation (`AuditLog.createdAt`, `DeadLetterEvent.movedAt`) pour les requêtes
  plateforme-admin qui ne filtrent jamais par organisation.
- Backup/restore : géré par l'hébergeur de la base (managé) — voir DATABASE_DESIGN.md pour la
  politique de rétention attendue. Un test de restauration réel en staging reste à planifier
  (nécessite un environnement staging avec credentials dédiés, hors périmètre de ce sprint).

## 9. Stockage (S3/R2) et email (Resend)

Les deux abstractions (`StorageProvider`, `EmailProvider`) sont prêtes à recevoir un provider réel
sans changement de code applicatif — le branchement du provider réel en production reste une
décision de déploiement différée (mission Sprint 21 §63-70, explicitement autorisée à rester
différée). Un échec de stockage n'écrit jamais un statut `READY` en base sans le fichier réellement
présent ; un échec d'email n'annule jamais une transaction métier déjà commitée.
