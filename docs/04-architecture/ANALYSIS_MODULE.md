# Module Analysis

Statut : Sprint 4.1 — socle technique implémenté. Aucune analyse métier réelle (RC/CCTP/CCAP/AE,
extraction de critères/délais/risques/questions, résumé métier, mémoire technique, scoring,
recommandation go/no-go, pricing, Knowledge Base, RAG, embeddings, Prompt Management complet,
assistant/agents IA) — explicitement hors périmètre, réservé au Sprint 4.2+.

## 1. Objectif

Fournir le socle technique du futur moteur d'analyse IA : abstraction des fournisseurs IA,
orchestration des jobs, persistance, statuts, versionnement, observabilité, retry/timeout, gestion
d'erreurs normalisées, API HTTP minimale. Le module ne produit qu'un résultat technique volontairement
minimal (`{ output: { summary } }`).

## 2. Position dans l'architecture

```
Identity ← Memberships ← Tenders ← DCE ← Extraction ← Analysis
```

`Analysis` consomme EXCLUSIVEMENT le contrat public d'Extraction
(`GetDocumentAnalysisInputUseCase`, correction P1-04 Sprint 3, réexporté par `extraction/index.ts`
et désormais aussi exporté par `ExtractionModule` pour l'injection DI) et le contrat public de
Tenders (`GetTenderUseCase`). Il n'accède jamais directement à un repository Prisma, une table SQL
ou un contrôleur HTTP interne d'un autre module.

```
apps/api/src/modules/analysis/
├── domain/            # AnalysisJob, AnalysisAttempt, statuts/scope/provider/trigger, erreurs, permissions
├── application/       # ports, use cases, policies, schéma de sortie (Zod), DTOs
├── infrastructure/     # config, repositories Prisma, dispatcher in-process, adapter OpenAI, registry, prompt statique
└── interfaces/http/    # schémas Zod, presenters, contrôleur, filtre d'erreurs
```

## 3. Modèle de données

- **AnalysisJob** — agrégat racine, UNE ligne PAR VERSION d'analyse pour une cible (jamais écrasée :
  un nouveau déclenchement crée toujours une nouvelle ligne, `analysisVersion` incrémenté). `scope`
  (DOCUMENT | TENDER), `targetId` (discriminant polymorphe = `documentId` ou `tenderId`, contraint
  par CHECK à rester cohérent avec `scope`/`documentId`/`dceId`/`tenderId`), `status` (PENDING |
  QUEUED | PROCESSING | SUCCEEDED | PARTIALLY_SUCCEEDED | FAILED | CANCELLED), `attemptCount`
  (jeton de réservation, compare-and-set), `analysisVersion`/`promptVersion`/`extractionVersion`/
  `inputChecksum` (versionnement), résultat technique minimal (`resultSummary`, tokens, durée),
  `errorCode`/`errorMessage` normalisés.
- **AnalysisAttempt** — historique append-only d'une réservation traitée (1 ligne par
  `attemptCount`). `trigger` (MANUAL | RETRY | SYSTEM), `retryCount` (nombre d'appels provider
  internes à CETTE réservation — jamais confondu avec `attemptNumber`).

Migration : `20260729231111_add_analysis_module` (CREATE TABLE / CREATE INDEX / ADD CONSTRAINT
uniquement, non destructive). Contraintes CHECK ajoutées dès cette migration (jamais différées,
contrairement à Extraction/P1-05) : `scope`, `status`, `trigger`, `outcome`, et une contrainte de
cohérence scope↔cible (`analysis_jobs_scope_target_check`). Unicité `(organization_id, scope,
target_id, analysis_version)` et `(job_id, attempt_number)`.

## 4. Cycle de vie — 3 phases, jamais de transaction longue

Même discipline que `ProcessDocumentExtractionUseCase` (module Extraction, correction P1-02) :

1. **Réservation courte** (`reserveForProcessing`, verrou consultatif Postgres) — QUEUED →
   PROCESSING, incrémente `attemptCount`. Aucune E/S.
2. **Traitement hors transaction** (`ProcessAnalysisJobUseCase.runPhase2`) — résolution du provider,
   rendu du prompt technique, appel réseau avec timeout (`Promise.race`) et retry interne bornés
   (backoff linéaire, erreurs retryables uniquement : timeout/rate limit/indisponibilité
   provider), validation Zod de la sortie.
3. **Finalisation courte** (`finalizeAttempt`, compare-and-set sur `attemptCount`) — une tentative
   obsolète n'écrase jamais un résultat plus récent.

La création d'une nouvelle version (double déclenchement) et le retry/l'annulation explicites
passent par des verrous courts dédiés (`runExclusiveForTarget`/`runExclusiveForJob`), jamais par une
transaction qui engloberait l'appel provider.

## 5. Provider IA

Port `AIProvider` (indépendant de tout SDK), résolu paresseusement par `AIProviderRegistry`
(`DefaultAIProviderRegistry`) — jamais à l'instanciation du module. Un seul adapter réel dans cette
tranche : `OpenAiProvider` (appel `fetch` direct vers l'API Chat Completions, sans SDK, pour éviter
une dépendance supplémentaire). Anthropic/Mistral/Azure OpenAI sont des valeurs acceptées par
`AnalysisProvider` mais sans adapter enregistré — le registry lève `AI_PROVIDER_NOT_CONFIGURED` s'il
sont sélectionnés, jamais quatre adapters complets.

## 6. Configuration

`analysis-config.ts` — **aucune** variable n'est obligatoire au démarrage (contrairement à
`extraction-config.ts`) : `AI_PROVIDER`/`OPENAI_API_KEY` absents n'empêchent jamais
`NestFactory.create(...)` de réussir. L'absence de configuration ne devient une erreur qu'au moment
de démarrer une analyse réelle (`AI_PROVIDER_NOT_CONFIGURED`), jamais avant.

## 7. Prompts

Abstraction minimale (`PromptKey`/`PromptVersion`/`PromptVariables`/`PromptTemplatePort`) préparée
pour le Sprint 6 (Prompt Management complet). Pour cette tranche : un seul template statique
(`StaticPromptTemplateProvider`), purement technique, aucun prompt métier RC/CCTP/CCAP/AE, aucun
écran d'administration, aucune table dédiée.

## 8. API HTTP minimale

`AnalysisController` (préfixe global `api/v1`) :

- `POST /tenders/:tenderId/analyses` — 202, scope TENDER.
- `POST /tenders/:tenderId/documents/:documentId/analyses` — 202, scope DOCUMENT (nesting sous
  `:tenderId`, cohérent avec DCE/Extraction — jamais une route document top-level orpheline).
- `GET /analyses/:analysisId`, `POST /analyses/:analysisId/retry`, `POST /analyses/:analysisId/cancel`
  — adressées directement par id ; l'organisation est résolue par le membership (`X-Organization-Id`),
  jamais par l'URL.

## 9. Limites du dispatcher in-process

`InProcessAnalysisDispatcher` (même motif que `InProcessExtractionDispatcher`) — `setImmediate`,
aucune file d'attente externe. Ne survit pas à un redémarrage du process : un job interrompu par un
crash reste `PROCESSING` jusqu'à un retry manuel. Limite documentée, acceptable pour cette tranche ;
remplaçable par une file externe sans changer le port `AnalysisDispatcher`.

## 10. Préparation Sprint 4.2

Le Sprint 4.2 pourra construire les entités métier spécialisées (TenderRisk, TenderCriterion,
TenderDeadline, TenderRequirement, TenderQuestion, etc.) au-dessus de `AnalysisJob` sans modifier ce
socle : le port `AIProvider`, le cycle réservation/traitement/finalisation, le versionnement et les
codes d'erreur normalisés sont déjà stables. Restent à faire, hors périmètre 4.1 : agrégation d'un
corpus multi-documents pour le scope TENDER (aujourd'hui volontairement technique/minimal), un vrai
Prompt Management, des schémas de sortie métier par type de document.
