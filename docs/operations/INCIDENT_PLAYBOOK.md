# TenderOS — Guide d'incident

> Sprint 21 (hardening). Scénarios réels couverts par les mécanismes effectivement implémentés à ce
> sprint — jamais une procédure hypothétique pour un mécanisme qui n'existe pas. Complète
> RUNBOOK.md (référencé plutôt que dupliqué).

## Provider IA (OpenAI) indisponible ou en panne

**Symptôme** : `ai_requests_total{outcome="failed"}` en hausse ; erreurs `AI_PROVIDER_UNAVAILABLE`/
`AI_RATE_LIMITED`/`AI_TIMEOUT` dans les logs (`ProcessAnalysisJobUseCase`/`ProcessGenerationUseCase`/
`SendMessageUseCase`).

**Ce qui se passe automatiquement** :
- Chaque appel a un timeout configuré (`AI_TIMEOUT_MS`) et un nombre borné de retries internes
  (`AI_MAX_RETRIES`) avec backoff — jamais un appel suspendu indéfiniment.
- Un job/génération qui échoue passe en `FAILED`, jamais silencieusement perdu. Un utilisateur peut
  le relancer manuellement (`RetryAnalysisUseCase`/`RetryGenerationUseCase`), borné par
  `1 + aiMaxRetries` tentatives au total (Sprint 21 — plus de retry illimité côté Generation).
- Analysis a un mécanisme d'escalade vers un modèle de secours (mission Sprint 5.2) si la policy de
  routage en définit un.
- Un message Chat resté `PENDING` au-delà de `CHAT_STALE_PENDING_THRESHOLD_MS` passe automatiquement
  à `FAILED` (ChatStalePendingRecoveryWorker) — la conversation ne reste jamais bloquée
  indéfiniment.

**Action manuelle si la panne est prolongée** : aucune action corrective côté TenderOS n'est
nécessaire au-delà de ce qui précède — communiquer aux utilisateurs que les fonctionnalités IA sont
temporairement indisponibles. `/health/ready` reste `ready` (le provider IA n'est jamais une
dépendance de readiness — mission §55/§56).

## Base de données injoignable

**Symptôme** : `GET /health/ready` retourne 503 (`{status:"not_ready", checks:{database:
"unreachable"}}`). `GET /health`/`GET /health/live` restent `ok` (le process est vivant, seule sa
capacité à servir du trafic dépendant de la base est affectée).

**Ce qui se passe automatiquement** :
- Un load-balancer configuré pour utiliser `/health/ready` cesse de router du trafic vers cette
  instance sans la tuer (contrairement à `/health` seul, qui provoquerait un redémarrage inutile).
- `PrismaService.onModuleInit()` journalise l'échec de connexion initial sans faire crasher le
  démarrage — les requêtes dépendant de la base échouent normalement (erreurs 500) tant que la
  connexion n'est pas rétablie, aucune corruption silencieuse.

**Diagnostic** : vérifier l'état du service Postgres managé (console de l'hébergeur), les logs
applicatifs pour le message d'erreur de connexion exact.

## Backlog Outbox (événements en attente/en échec)

**Symptôme** : `outbox_pending` élevé et croissant, ou `outbox_dead_letter` > 0.

**Diagnostic** :
1. `GET /admin/outbox/dead-letters?organizationId=...` (Platform Admin) pour identifier les
   événements définitivement en échec — `failureReason`/`eventType`/`aggregateType` indiquent la
   cause probable.
2. Vérifier que `OutboxPublisherWorker` tourne (log `"Outbox worker started"` au démarrage, tick
   régulier). S'il est désactivé (`OUTBOX_WORKER_ENABLED=false`), c'est la cause la plus probable
   d'un backlog qui ne se résorbe jamais.
3. Un `NoOutboxHandlerRegisteredError` répété pour un `eventType` donné signale un événement émis
   par un module dont le handler consommateur n'est pas enregistré dans `AppModule` — bug de
   déploiement/régression, jamais un cas normal.

**Ce qui NE nécessite PAS d'action manuelle** : un événement en `FAILED` avec un `nextAvailableAt`
futur suit son propre calendrier de retry (backoff exponentiel + jitter) — laisser faire sauf
urgence.

## Backlog d'emails (alertes de veille marché)

**Symptôme** : `SendPendingEmailAlertsUseCase` journalise des échecs répétés
(`"Email alert send failed for user..."`).

**Diagnostic** : le provider email (Resend, ou son équivalent configuré) est probablement en panne
ou mal configuré. Un échec d'envoi n'affecte JAMAIS le matching/la détection de marché eux-mêmes
(pipeline physiquement distinct, mission §67) — seule la notification email est retardée, la
notification in-app reste disponible.

## Jobs d'intégration bloqués (Microsoft/Google)

**Symptôme** : une opération d'import/export ne progresse jamais, ou reste dans un état
"NEEDS_RECONCILIATION".

**Ce qui se passe automatiquement** : `callProviderJson`/`callProviderBinary` a un timeout de 15 s
et jusqu'à 3 tentatives — un appel ne reste jamais suspendu indéfiniment côté TenderOS. Une erreur
réseau AMBIGUË (le provider a peut-être quand même traité la requête) sur une opération d'écriture
non idempotente déclenche `NEEDS_RECONCILIATION` plutôt qu'un retry automatique aveugle — nécessite
une vérification manuelle côté provider avant de relancer.

**Diagnostic** : `integration_requests_failed{provider}` (métriques) pour identifier quel provider
est en cause ; logs de `ProviderErrorCode` pour la classification exacte de l'échec.

## Job d'analyse/génération resté bloqué

**Symptôme** : un `AnalysisJob`/`Generation` reste en `PROCESSING`/`GENERATING` sans jamais
atteindre un état terminal.

**Ce qui se passe automatiquement depuis le Sprint 21** : `AnalysisJobStaleRecoveryWorker`/
`GenerationStaleRecoveryWorker` reprend automatiquement tout job resté dans cet état au-delà de
10 minutes (défaut), le remet en file, et le worker en-process le re-déclenche. Aucune action
manuelle n'est normalement nécessaire — si le blocage persiste malgré ces workers, vérifier qu'ils
sont bien activés (`*_STALE_RECOVERY_WORKER_ENABLED`, voir RUNBOOK.md §1.3) et que le worker qui
crashait à répétition n'a pas un problème sous-jacent qui affecte aussi la reprise elle-même
(vérifier les logs pour `"Failed to reclaim..."`).

## Redéploiement (Railway envoie SIGTERM)

**Comportement attendu** : `app.enableShutdownHooks()` (Sprint 21) garantit que chaque worker
arrête proprement son timer et que Prisma se déconnecte avant que le process ne soit tué — jamais un
worker interrompu en plein tick ni une connexion Postgres coupée brutalement. Aucune action
manuelle nécessaire pour un redéploiement standard.
