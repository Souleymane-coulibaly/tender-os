# FIX-3B — Le runtime respecte le catalogue Outbox

**Checkpoint** : TENDEROS-2.1-P2.3-E12.4 — FIX-3B · **Verdict : `FIX_3B_CERTIFIED`**

---

## A. Executive summary

`NoOutboxHandlerRegisteredError` disparaît **uniquement là où ce n'était pas une erreur**. Un
`INTERNAL` mal câblé échoue toujours aussi bruyamment ; un `AUDIT_ONLY` correctement déclaré termine
proprement en une seule réclamation au lieu de cinq.

Mesure centrale : **10 événements AUDIT_ONLY, 10 réclamations au total** sur dix ticks successifs —
contre 50 avant FIX-3B (5 tentatives chacun avant dead-letter).

## Question préalable : que signifie `PUBLISHED` ?

Vérifié **avant** toute modification, comme demandé. `markPublished` ne fait qu'écrire le statut et
`publishedAt` ; `publishedAt` n'a **aucun consommateur métier** dans le produit ; et `claimPendingBatch`
ne réclame que `PENDING`/`FAILED`/`PROCESSING`. `PUBLISHED` est donc l'état terminal de la **politique
de livraison** — « cette ligne est traitée, ne la réclame plus » — et non une affirmation qu'un effet
interne a eu lieu.

`AUDIT_ONLY → PUBLISHED` est donc cohérent. **Aucun nouveau statut, aucune migration.**

## B. Point d'intégration retenu — et pourquoi

`CompositeOutboxEventDispatcher`, pour trois raisons :

1. Il possède **déjà** la décision « existe-t-il un handler pour ce type ? » et lève déjà l'erreur.
   La question « cette absence est-elle une erreur ? » est la même question, au même endroit.
2. `PublishPendingOutboxEventsUseCase` reste **strictement inchangé** — donc retries, backoff,
   `MAX_ATTEMPTS` et dead-letter des vraies erreurs sont identiques *par construction*, pas par
   vérification.
3. Point unique : le catalogue est consulté à un seul endroit du pipeline.

Écartés : le repository SQL (§4), le worker, les producers, les handlers.

## C. Sémantique runtime par classification

| Classification | Handler absent | Handler présent |
|---|---|---|
| `INTERNAL` | `NoOutboxHandlerRegisteredError` → FAILED → retry → DEAD_LETTER *(inchangé)* | exécuté, idempotence `ProcessedEvent` *(inchangé)* |
| `EXTERNAL_WEBHOOK` | idem `INTERNAL` — la livraison webhook **passe par un handler interne** (bridge Integration Hub) | exécuté *(inchangé)* |
| `AUDIT_ONLY` / `LEGACY` | **retour normal → PUBLISHED**, aucun retry, `attemptCount` non incrémenté | `ContradictoryOutboxCatalogEntryError` |
| **non catalogué** | `UncatalogedOutboxEventTypeError` → FAILED → retry | idem |

Point important sur `EXTERNAL_WEBHOOK` : je ne l'ai pas assimilé à « aucun handler interne » (§3). La
règle est dérivée d'un ensemble `DELIVERED_DESTINATIONS = [INTERNAL, EXTERNAL_WEBHOOK]`, calculé
depuis le catalogue — jamais d'une liste de types codée en dur (§7).

## D. Fichiers modifiés

| Fichier | Nature |
|---|---|
| `outbox/infrastructure/composite-outbox-event-dispatcher.ts` | intégration du catalogue |
| `outbox/domain/errors.ts` | 2 erreurs explicites ajoutées |
| `outbox/application/ports/outbox-event-delivery-policy.ts` | **nouveau** — port de la règle de livraison |
| `outbox/domain/outbox-event-catalog.ts` | `requiresInternalDelivery()` ajouté (FIX-3A) |
| `outbox/infrastructure/catalog-driven-delivery.integration.spec.ts` | **nouveau** — 7 preuves |
| `composite-outbox-event-dispatcher.spec.ts`, `outbox.integration.spec.ts` | adaptés (§24) |

Le port injectable mérite une justification : plusieurs suites déclarent des `eventType`
**synthétiques** (`OWN_EVENT`/`FOREIGN_EVENT`/`TEST_EVENT`) qui n'ont pas leur place dans le catalogue
produit. Sans ce port, il aurait fallu soit polluer la SSoT avec des types fictifs, soit renoncer à
exercer le vrai dispatcher. Elles déclarent désormais la classification de leurs fixtures ; la
production, elle, utilise le catalogue **par défaut, sans configuration**.

`ScopedOutboxTestHarness` n'a **pas** été modifié (§4) — il reçoit son dispatcher, il ne le construit pas.

## E→G. Cycles de vie prouvés (PostgreSQL réel)

- **AUDIT_ONLY sans handler** → `PUBLISHED`, `attemptCount = 0`, `lastError = null`, `failed = 0`.
- **AUDIT_ONLY, 10 ticks** → jamais DEAD_LETTER, **10 réclamations pour 10 événements**.
- **INTERNAL sans handler** → FAILED / attempt 1 / `"No outbox handler is registered"`, puis
  DEAD_LETTER à `attemptCount = 5`.
- **Handler qui lève** → FAILED, `"transient downstream failure"` : aucune vraie erreur transformée en succès.
- **Type non catalogué** → FAILED, `"not declared in OUTBOX_EVENT_CATALOG"` — jamais un succès.
- **Contradiction** → handler **non exécuté** (`executed === false`), FAILED explicite.

## H/I. Webhook & multi-destination

Pipeline Integration Hub inchangé : ses 10 eventTypes restent `EXTERNAL_WEBHOOK` avec handler, donc
traités exactement comme avant. Le catalogue **modélise** déjà des destinations multiples, mais le
dispatcher conserve un handler par type — **F3-003 reste différé** (§17/§33), aucun refactor lourd.

## J→M. Non-régressions métier

`analysis`, `document-generation`, `knowledge-base`, `billing` : **92 fichiers / 757 tests verts**.
Le dispatch métier réel (`InProcessAnalysisDispatcher`) n'est pas touché — FIX-3B n'intervient que
sur la livraison Outbox, jamais sur le workflow. Aucun effet nouveau inventé pour
`KnowledgeEntry*`/`CandidateCompanyProfileUpdated`. `PassConsumedForTender` conserve sa notification ;
`PassReserved`/`Released` restent sans effet, conformément à leur classification.

## N/O. Retry, backoff, dead-letter

Inchangés : `PublishPendingOutboxEventsUseCase` n'a pas été modifié d'une ligne. `MAX_ATTEMPTS = 5`,
backoff `30s × 2^(n-1)`, `claimPendingBatch` intact.

## P/Q. Lot mixte et claims parasites

50 `AUDIT_ONLY` + 10 `INTERNAL` handlés + 5 `INTERNAL` sans handler, **un seul tick** :

| | Résultat |
|---|---|
| `published` | **60** (50 audit + 10 internes) |
| `failed` | **5** (les internes sans handler) |
| `deadLettered` | 0 |
| effets de bord réels | **10** — exactement les INTERNAL handlés |

Aucune classification n'a influencé le traitement d'une autre.

**Claims parasites** : 10 AUDIT_ONLY → 50 réclamations avant, **10 après**. Réduction × 5, mesurée
sur des événements **nouvellement créés** (§23) ; les 104 dead-letter historiques sont intacts.

## R→U. Régressions

| Suite | Résultat |
|---|---|
| Outbox complète | **45 / 45** |
| Catalogue FIX-3A | **8 / 8** |
| FIX-2A (scoped harness, workspace, integrations) | **40 / 40** |
| Modules métier ciblés | **757 / 757** |
| FIX-3B (nouveau) | **7 / 7** |

**H6 leak check** : `NEW_ORGANIZATION_LEAK = 0`, `NEW_OUTBOX_LEAK = 0`, `NEW_USER_LEAK = 0`,
`NEW_SESSION_LEAK = 0`. Organisations toujours à 432. À signaler honnêtement : les totaux globaux
`users`/`sessions` ont bougé de +3 pendant les régressions métier — imputable à d'autres suites, pas
à FIX-3B (le contrôle scopé `fix3b-catalog-%` est à 0).

## V. Gates

Typecheck : **0 erreur**. Lint ciblé FIX-3B : **PASS**.

## W. Findings différés

`F3-003` (un handler par eventType) · `F3-005` (`eventVersion` non utilisé au routage) · audit Legacy
· purge des dead-letter historiques. Aucun traité ici.

## X. Risques

1. Un futur producteur livrant un type non déclaré verra ses événements partir en dead-letter. C'est
   **voulu** (§18) et FIX-3C rendra l'oubli impossible en CI.
2. Une classification `AUDIT_ONLY` erronée empêcherait un handler futur de s'exécuter — mais la
   contradiction lève désormais une erreur explicite plutôt que de passer inaperçue.

## Y. Verdict

```
FIX_3B_CERTIFIED
FIX_3B_STATUS = CLOSED
FIX_3C_STATUS = READY
F2_STATUS     = OPEN_PENDING_FIX_3C_AND_FULL_CERTIFICATION
NEXT_ACTION   = FIX_3C
```

Full-suite non relancée. Aucun commit, aucun push.
