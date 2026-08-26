# FIX-3 — AUDIT du catalogue Outbox

**Checkpoint** : TENDEROS-2.1-P2.3-E12.4 — AUDIT FIX-3 · **Verdict : `FIX_3_REQUIRED`**
Audit en lecture seule. Aucun fichier modifié, aucun handler, producer, worker ou migration touché.

---

## A. Executive summary

Le défaut n'est pas « des handlers manquants ». C'est que **l'architecture ne permet pas d'exprimer
qu'un événement n'a besoin d'aucun handler interne**. `CompositeOutboxEventDispatcher` lève
`NoOutboxHandlerRegisteredError` pour tout `eventType` non enregistré — choix délibéré et documenté
(« jamais un faux succès silencieux »), parfaitement défendable quand le catalogue comptait quelques
événements. Aujourd'hui **46 des 76 types produits n'ont aucun handler**, et chacun parcourt donc
systématiquement 5 tentatives avant le dead-letter.

Le câblage, lui, est **sain** : aucun handler implémenté n'est laissé non enregistré.

## B/C. Volumétrie

| | |
|---|---|
| eventTypes Outbox réellement produits | **76** |
| Handlers enregistrés | **30** |
| **Produits SANS handler** | **46** |
| Handlers sans producteur | **0** |
| Handlers implémentés mais non câblés | **0** |

Méthode : balayage statique des littéraux `eventType: "…"`, **complété** par les producteurs
conditionnels que ce balayage manque (`DceAnalysisCompleted`/`DceAnalysisFailed`,
`AdministrativeFormGenerated`/`AdministrativeFormGenerationFailed`, `TaskCompleted`/`TaskUpdated`),
puis recoupé avec les `event_type` réellement présents en base.

Deux faux positifs écartés : `UNKNOWN` (c'est un `SignatureProviderEvent`, autre agrégat) et
`webhook.test` (crée une `WebhookDelivery` directement, ne passe pas par l'Outbox).

## F. Matrice Producer → Handler (synthèse)

| Classification | Nombre | Exemples |
|---|---|---|
| `HANDLED` | 30 | `TenderCreated`, `TaskCreated`, `TaskCompleted`, `GoNoGoDecisionRecorded`, `Approval*`, `TaskAssigned`, `UserMentioned`, `Subscription*`, `Trial*`, `Pass{Consumed,PurchaseConfirmed}`, `Quota*`, `DocumentVersionAdded`, `MembershipCreated`, `ChatMessageSent`, `external_tender.*`, `response_package.*`, `saved_search.match_found`, `notification.created` |
| `UNHANDLED_INTENTIONAL` | ~44 | `Opportunity*`, `Knowledge*`, `Tender{Archived,Abandoned,StatusChanged,LotCreated,DeadlineChanged,Candidate*}`, `ChecklistItem*`, `Dce Analysis*`, `Administrative*`, `AiSuggestion*`, `Subcontractor*`, `CommentAdded`, `TenderParticipant*`, `Conversation/AiResponse*`, `CandidateCompanyProfileUpdated`, `TaskUpdated` |
| `UNHANDLED_REQUIRED` | **0 démontré** | voir §G |
| `LEGACY_ORPHAN` | 0 | aucun handler orphelin, aucun type mort identifié |
| `UNKNOWN` | 0 | tous les types produits sont attribués à un producteur |

## G. `UNHANDLED_REQUIRED`

**Aucun effet métier perdu n'est démontré par cet audit.** Les surfaces à effet réel — notifications
(E11), webhooks (catalogue gouverné de 11 types), quotas — sont toutes couvertes par un handler.
Je ne classe donc aucun événement `UNHANDLED_REQUIRED` sans preuve, conformément au §3.

Deux asymétries méritent néanmoins `INVESTIGATE` (et non une conclusion) :

| EventType | Observation | Confiance |
|---|---|---|
| `PassReservedForTender` / `PassReservationReleased` | `PassConsumedForTender` **a** un handler de notification, ces deux-là non — asymétrie interne à la même famille billing | Moyenne |
| `CommentAdded` / `TenderParticipant{Added,Removed}` | 6 événements workspace notifiés en E11, ceux-ci exclus — décision produit probable, à confirmer | Moyenne |

## H. `UNHANDLED_INTENTIONAL`

La très grande majorité. Ce sont des événements de domaine écrits dans l'Outbox pour la traçabilité
et pour d'éventuels consommateurs futurs — exactement le « cas normal » décrit dans le commentaire du
dispatcher. Leur problème n'est pas d'être sans handler : c'est d'être **traités comme des échecs**.

## J. Handler existant mais non wired

**Aucun.** `OutboxModule.forRoot` est l'unique point d'assemblage, appelé une seule fois dans
`app.module.ts`, et agrège `INTEGRATION_OUTBOX_HANDLERS` + `NOTIFICATION_OUTBOX_HANDLERS` +
`QUOTA_THRESHOLD_OUTBOX_HANDLERS`. Les trois modules sont importés. Ce vecteur — le plus dangereux
du §9 — est **propre**.

## K. Versions

Aucun mismatch. `eventVersion` vaut 1 partout et n'est utilisé par aucune logique de routage : le
dispatcher route sur le seul `eventType`. À noter comme dette latente : une V2 de payload ne serait
aujourd'hui pas distinguable.

## M. Consommateurs externes

`NO INTERNAL HANDLER` ≠ `NO CONSUMER` : les 11 types du catalogue webhook gouverné
(`GOVERNED_WEBHOOK_EVENT_TYPES`) sont pontés vers l'Integration Hub par des handlers Integrations
dédiés. **Aucun des 46 types non handlés n'appartient à ce catalogue** — ils n'ont donc réellement
aucun consommateur, interne ou externe.

**Contrainte structurelle à signaler** : le dispatcher est une `Map<eventType, handler>` — **un seul
handler par eventType**. Le dépôt le reconnaît explicitement dans deux modules consommateurs. Un
événement qui devrait à la fois notifier *et* déclencher un webhook ne le peut pas.

## N/O. Retry, backoff, dead-letter

`OUTBOX_MAX_ATTEMPTS = 5` · backoff `30s × 2^(n-1)` plafonné à 3600 s.

Trajectoire d'un événement sans handler :
`PENDING → CLAIM → NO HANDLER → FAILED (30 s) → … → DEAD_LETTER` après **5 claims** et ≈ 7,5 min.

**Le mécanisme est borné** — c'est le point rassurant du §16 : aucun retry infini, aucun événement ne
reste indéfiniment `PENDING`/`FAILED`. Chaque événement non handlé coûte néanmoins **5 slots de lot**.

## Preuve runtime (base réelle)

20 `eventType` distincts en `DEAD_LETTER`, **tous** à `attempt_count = 5`, **tous** avec l'erreur
`No outbox handler is registered for event type "…"` :

| Type | Lignes | Type | Lignes |
|---|---|---|---|
| `DceAnalysisFailed` | 16 | `AdministrativeFormGenerated` | 6 |
| `DceAnalysisStarted` | 16 | `OpportunityStatusChanged` | 6 |
| `DceAnalysisRequested` | 14 | `OpportunityCreated` | 5 |
| `KnowledgeEntryCreated` | 10 | `TenderLotCreated` | 4 |
| `CandidateCompanyProfileUpdated` | 8 | … 11 autres | 1–3 |

104 lignes en dead-letter ⇒ **≈ 520 claims parasites** consommés historiquement. Sur une base de
test modeste, cela représente déjà un backlog comparable à cinq lots pleins.

## Q. Couverture de tests

`NOT_COVERED` pour les 46 types non handlés — par construction : aucun effet à vérifier.
`PARTIAL` à `FULLY_COVERED` pour les types handlés (notifications et Integration Hub disposent de
tests HTTP + PostgreSQL réels de bout en bout).

## R. Findings

| ID | Sév. | Classification | Résumé |
|---|---|---|---|
| **F3-001** | **P2** | Structurel | 46/76 types produits n'ont aucun handler et sont traités comme des échecs ; 5 tentatives chacun avant dead-letter. Backlog parasite mesuré ≈ 520 claims. Aucune perte fonctionnelle. Confiance **élevée** (preuve statique + runtime concordante). |
| **F3-002** | **P2** | Architecture | Aucun moyen d'exprimer « pas de handler interne requis ». Cause racine de F3-001. Confiance **élevée**. |
| **F3-003** | **P3** | Contrainte | Un seul handler par `eventType` : notification **et** webhook mutuellement exclusifs sur un même événement. Confiance **élevée**. |
| **F3-004** | **P3** | À investiguer | `PassReservedForTender`/`PassReservationReleased` sans handler alors que `PassConsumedForTender` en a un. Confiance **moyenne**. |
| **F3-005** | **P3** | Dette | `eventVersion` présent mais jamais utilisé au routage. Confiance **élevée**. |

**Aucun P0. Aucun P1** — aucun effet métier perdu n'a pu être démontré.

## S. Correctifs recommandés (non implémentés)

- 44 types `UNHANDLED_INTENTIONAL` → `MARK_AS_NO_INTERNAL_HANDLER_REQUIRED`
- `PassReservedForTender`, `PassReservationReleased`, `CommentAdded`, `TenderParticipant*` → `INVESTIGATE`
- **Jamais** de handler no-op (§26) : la bonne réponse est la classification, pas un faux consommateur.

## T. Test contractuel recommandé (à implémenter plus tard)

> Tout `eventType` produit doit être déclaré dans le catalogue avec exactement une stratégie de
> consommation : `INTERNAL` (handler obligatoire), `EXTERNAL_WEBHOOK`, `AUDIT_ONLY` ou `LEGACY`.
> Un producteur introduisant un type non déclaré fait échouer le test.

## U. Verdict

```
FIX_3_REQUIRED
F2_STATUS = OPEN_PENDING_FIX_3_AND_FULL_CERTIFICATION
```

### `RECOMMENDED_FIX_3_PLAN`

**FIX-3A** — Introduire la typologie (`INTERNAL` / `EXTERNAL_WEBHOOK` / `AUDIT_ONLY` / `LEGACY`) et
la déclarer pour les 76 types. Pur ajout, aucun changement de comportement.

**FIX-3B** — Faire respecter la typologie par `PublishPendingOutboxEventsUseCase` : un `AUDIT_ONLY`
atteint un état terminal propre sans passer par `FAILED`. Un `INTERNAL` sans handler reste une
erreur. Supprime le backlog parasite à la racine. *Dépend de 3A.*

**FIX-3C** — Ajouter le test contractuel du §T, qui empêche la réapparition du problème.
*Dépend de 3A et 3B.*
