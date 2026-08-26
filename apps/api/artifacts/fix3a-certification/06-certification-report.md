# FIX-3A — Catalogue Outbox : Source of Truth déclarative

**Checkpoint** : TENDEROS-2.1-P2.3-E12.4 — FIX-3A · **Verdict : `FIX_3A_CERTIFIED`**

---

## A. Executive summary

FIX-3A nomme l'intention de chaque événement Outbox, sans toucher au runtime. Le catalogue couvre
**78 eventTypes** — deux de plus que les 76 de l'audit : mon balayage reconstruit détecte aussi
`DocumentGenerationCompleted` / `DocumentGenerationFailed`, émis via un ternaire que le balayage
littéral de l'audit manquait. J'ai élargi, jamais réduit (§7).

Le point le plus important de ce travail n'est pas le comptage mais la **distinction** qu'il rend
explicite : un événement sans handler n'est pas forcément un handler oublié. Pour les 48 concernés,
la preuve montre que **l'effet métier est déjà réalisé au moment de l'émission** — ce sont des
résultats, pas des commandes.

## B/C/D. Architecture, typologie, destinations multiples

Fichier unique : `src/modules/outbox/domain/outbox-event-catalog.ts`.
Typologie retenue : `INTERNAL` · `EXTERNAL_WEBHOOK` · `AUDIT_ONLY` · `LEGACY`. Aucune catégorie
fourre-tout (`OTHER`/`NONE`/`UNKNOWN`).

**`destinations` est un tableau, pas un enum exclusif** (§4). Le dispatcher actuel n'admet qu'un
handler par type (`Map<eventType, handler>`), mais cette limite d'implémentation ne doit pas dicter
la modélisation métier : un événement pourra légitimement devoir notifier **et** livrer un webhook.

Le champ `publicWebhookTypes` est lui aussi **pluriel** — et ce n'est pas de la prudence gratuite :
le test de réconciliation a révélé que `GoNoGoDecisionRecorded` résout vers **deux** types publics
(`opportunity.go_decided` / `opportunity.no_go_decided`) selon la décision portée par le payload.
J'ai corrigé le modèle, pas le test.

## E/T. Les 78 eventTypes

| Destination | Nombre |
|---|---|
| `AUDIT_ONLY` | **48** |
| `INTERNAL` | **20** |
| `EXTERNAL_WEBHOOK` | **10** |
| `LEGACY` | **0** |

`INTERNAL` + `EXTERNAL_WEBHOOK` = 30 = exactement le nombre de handlers enregistrés.
Matrice complète : `01-event-catalog.json` (eventType, module, producteurs avec fichier:ligne,
handler, types webhook publics).

Deux faux positifs de l'audit sont exclus, avec justification inscrite dans le catalogue :
`UNKNOWN` (c'est un `SignatureProviderEvent`, autre agrégat) et `webhook.test` (crée une
`WebhookDelivery` directement, ne passe jamais par l'Outbox).

## F. Réconciliation des 30 handlers

20 `INTERNAL` (notifications workspace + billing, quotas) et 10 `EXTERNAL_WEBHOOK` (Integration Hub).
Aucun handler n'est classé `AUDIT_ONLY` — un test le verrouille comme contradiction de gouvernance.
Aucun handler orphelin. Détail : `02-handler-reconciliation.json`.

## G. Réconciliation des 11 webhooks

Les 11 types publics gouvernés sont tous couverts par 10 eventTypes internes, l'écart venant du
double mapping de `GoNoGoDecisionRecorded`. Vérifié par test sur les types **publics**, jamais par un
comptage 1:1. Détail : `03-webhook-reconciliation.json`.

## H/K/L/M. Classification des 48 sans handler — par la preuve

| Famille | Preuve | Classification |
|---|---|---|
| `DceAnalysisRequested/Started/Completed/Failed` | `start-document-analysis` écrit l'événement **puis** appelle `dispatcher.dispatch()` : la commande réelle passe par `InProcessAnalysisDispatcher`, jamais par l'Outbox | `AUDIT_ONLY` — **HIGH** |
| `DocumentGeneration*`, `AdministrativeForm*` | émis avec `revision.status === "COMPLETED" ? … : …` — la révision porte déjà un statut terminal | `AUDIT_ONLY` — **HIGH** |
| `KnowledgeEntry*`, `CandidateCompanyProfileUpdated` | aucun consommateur d'indexation, RAG, embeddings ou projection n'existe dans ces modules ; l'événement est écrit dans la même transaction que la sauvegarde | `AUDIT_ONLY` — **HIGH** |
| `Opportunity*`, `Tender*`, `ChecklistItem*`, `AiSuggestion*`, `Subcontractor*`, `Conversation/AiResponse*` | traces de domaine, effet déjà persisté | `AUDIT_ONLY` — **HIGH** |

## I. Pass — la famille la plus délicate

`PassConsumedForTender` a un handler de notification ; `PassReservedForTender` et
`PassReservationReleased` n'en ont pas. Cette asymétrie **n'est pas un oubli** : le module
`notification-event-consumers` documente que la mission Sprint 22 §53/§54 a **énuméré explicitement
les 5 événements billing** à notifier, ces deux-là en étant exclus. La sémantique le confirme : la
réservation est une allocation interne (E1.2/E1.3) et le release une **compensation d'échec** —
notifier un utilisateur d'une compensation serait une erreur produit.

Classés `AUDIT_ONLY`, avec `productReviewSuggested: true`.

## J. CommentAdded / TenderParticipant*

Même raisonnement : la mission Sprint 18 §15/§21/§50/§51 a énuméré 6 événements workspace à
notifier ; ceux-ci en sont exclus, et la notification liée aux commentaires passe par `UserMentioned`.
`AUDIT_ONLY` + `productReviewSuggested: true`.

**Pourquoi cela ne bloque pas la certification** (§26) : classer `AUDIT_ONLY` ne peut pas faire
perdre un effet existant — il n'en existe aucun aujourd'hui. Le risque que le §26 vise serait de
masquer un manque ; le drapeau `productReviewSuggested` le rend au contraire visible et nommé dans la
SSoT, sans laisser d'`INVESTIGATE` ambigu dans le catalogue certifié (§9).

## N. Legacy

**Aucun** événement classé `LEGACY` : aucune preuve structurelle ne rattache un eventType à V1 ou à
un flux déprécié. Je n'en fais pas une catégorie poubelle (§17).

## O. Ambiguïtés restantes

Aucune bloquante. Les 5 événements `productReviewSuggested` relèvent d'une décision produit
(« faut-il notifier l'utilisateur ? »), pas d'une incertitude technique.

## P. Type safety

Union littérale `CatalogedOutboxEventType` dérivée du tableau `as const`, `Map` de lookup,
`findOutboxEventCatalogEntry` renvoyant `undefined` pour un type non catalogué — **jamais** une
classification par défaut. Pas de `Record<string, …>`.

## Q. Non-régression runtime — l'exigence centrale

- Aucun fichier runtime modifié : dispatcher, publisher, worker, repository, harness intacts.
- `grep` confirme qu'**aucun fichier de production n'importe le catalogue** : il est inerte.
- `NoOutboxHandlerRegisteredError` est toujours levé pour tout type sans handler, `AUDIT_ONLY`
  compris — volontaire, la sémantique ne changera qu'en FIX-3B.
- Suite Outbox : **7 fichiers / 45 tests verts**, comportement identique.

## R. Tests

| | |
|---|---|
| Tests catalogue (nouveaux) | **8 / 8** |
| Suite Outbox existante | **45 / 45** |
| Typecheck API | PASS |
| Lint ciblé FIX-3A | PASS |

## S. Findings

- **F3A-001 (P3)** — l'audit annonçait 76 types, le balayage reconstruit en trouve **78**
  (`DocumentGenerationCompleted/Failed`). Confirme que seule une SSoT versionnée évite la dérive.
- **F3-005 (P3, différé)** — `eventVersion` toujours inutilisé au routage. Non traité ici (§16).
- **F3-003 (P3, différé)** — un seul handler par eventType. Le catalogue modélise déjà des
  destinations multiples ; lever la limite relèverait de FIX-3B/3C.

## U. Verdict

```
FIX_3A_CERTIFIED
FIX_3A_STATUS = CLOSED
FIX_3B_STATUS = READY
F2_STATUS     = OPEN_PENDING_FIX_3B_3C_AND_FULL_CERTIFICATION
NEXT_ACTION   = FIX_3B
```

Fichiers créés : `src/modules/outbox/domain/outbox-event-catalog.ts` et son spec. Aucun autre
fichier touché. Aucun commit, aucun push.
