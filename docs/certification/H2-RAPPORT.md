# H.2 — Création et bascule de candidat : correction, idempotence, latence

**Branche** : `v2.1-post-decom-tnr3-certification` · **HEAD** : `074551d` · travaux non commités
(contrainte « no commit / no push » maintenue).

---

## 1. Flux tracés (§2/§3)

`CREATE_FLOW` — formulaire → action serveur Next.js (`createTenderAction`) → `POST /api/v1/tenders`
→ `CreateTenderUseCase` : permission, résolution + accès client, client non archivé, permission
`CreateTender`, candidat **obligatoire** existant et non archivé, acheteur éventuel, puis
**`atomicTransactionRunner.run(save + audit + outbox)`** → réponse → `revalidatePath("/app/tenders")`
→ `redirect` vers la fiche.

`SWITCH_FLOW` — section « Entreprise candidate » → action serveur →
`POST /api/v1/tenders/:id/candidate-company` → `ChangeTenderCandidateCompanyUseCase` : permission,
`assertTenderMutationAllowed`, candidat existant et non archivé, puis mutation + audit + outbox →
réponse → `revalidatePath` de la fiche.

---

## 2. Un défaut de correction reproduit et corrigé

**`SWITCH_TRANSACTION_STATUS` initial = `PARTIAL_STATE_RISK`.** Le changement de candidat effectuait
`save`, `audit` et `outbox` en **trois `await` séquentiels sans transaction**, là où la création les
regroupe depuis l'origine.

Reproduit par injection de panne sur les singletons réels :

| Panne injectée | État observé AVANT correction |
| --- | --- |
| journal d'audit | Tender **basculé sur le nouveau candidat**, aucune trace d'audit |
| Outbox | Tender **basculé**, audit écrit, **aucun événement de domaine** |

Deux conséquences, toutes deux silencieuses : un changement d'entité juridique candidate invisible
pour l'audit, et des consommateurs restés sur l'ancien candidat sans que rien ne signale l'anomalie.
Le changement de candidat décide quelle personne morale répond à l'appel d'offres — il mérite la même
garantie que la création.

**Correctif** : les trois écritures obligatoires sont regroupées dans `atomicTransactionRunner`,
exactement comme `CreateTenderUseCase`. Après correction, les deux pannes laissent le Tender sur son
candidat d'origine, sans trace d'audit résiduelle.

| Champ | Valeur |
| --- | --- |
| `CREATE_TRANSACTION_STATUS` | **`ATOMIC_REQUIRED_WRITES`** — vérifié par injection, jamais déduit |
| `SWITCH_TRANSACTION_STATUS` | **`ATOMIC_REQUIRED_WRITES`** (après correctif) |
| `CREATE_AUDIT_FAILURE_STATUS` · `CREATE_OUTBOX_FAILURE_STATUS` | annulation intégrale |
| `SWITCH_AUDIT_FAILURE_STATUS` · `SWITCH_OUTBOX_FAILURE_STATUS` | annulation intégrale |

Aucune écriture obligatoire n'a été déplacée en tâche de fond pour gagner du temps (§25/§26/§27).

---

## 3. Bascule sans effet : un journal d'audit qui disait faux

Mesure du contrat **avant** correction, pour une demande B → B alors que le candidat était déjà B :

> version `1 → 2`, **1 entrée d'audit** `tender.candidate_company_changed`, **1 événement de domaine**

Un journal d'audit qui rapporte des changements n'ayant pas eu lieu est un journal auquel on ne peut
plus se fier ; et l'événement poussait les consommateurs à retraiter un Tender inchangé.

**Correctif** : détection du no-op, placée **après** la validation du candidat fourni afin de
préserver exactement le contrat existant (un candidat inexistant ou archivé reste refusé, même s'il
est déjà le courant).

`NOOP_SWITCH_STATUS` = **aucune mutation, aucun audit, aucun événement**.

**Effet recherché** : deux requêtes A→B concurrentes ne produisent plus qu'un seul changement
observable, la perdante devenant un no-op. `OUTBOX_DUPLICATE_EVENT_STATUS` et
`AUDITLOG_DUPLICATION_STATUS` = **≤ 1 par changement réel** — une idempotence observable qui découle
d'une **règle métier vraie**, et non d'un mécanisme de déduplication ajouté.

| Champ | Valeur |
| --- | --- |
| `DOUBLE_SWITCH_STATUS` | état final B, un seul changement observable |
| `CONCURRENT_SWITCH_POLICY` | **dernier écrivain gagne** — l'état final est B ou C, jamais un mélange |
| `STALE_SWITCH_STATUS` | l'API accepte `tenderId + newCandidateId` sans candidat attendu ni version : une interface périmée **peut** écraser une sélection plus récente. Sémantique documentée, jugée acceptable pour 2.1 — la mutation reste atomique et tracée |

---

## 4. Latence : mesurée, non reproduite

Horloge monotone, 10 itérations, PostgreSQL et HTTP réels.

| Mesure | Médiane | p95 | Pire |
| --- | ---: | ---: | ---: |
| `CREATE_LATENCY_BREAKDOWN` — serveur (HTTP entrant → réponse) | **65 ms** | 118 ms | 118 ms |
| `SWITCH_LATENCY_BREAKDOWN` — serveur | **65 ms** | 78 ms | 78 ms |
| Création — **visible par l'utilisateur** (clic → fiche affichée) | **2 454 ms** | — | — |
| Bascule — **visible par l'utilisateur** (clic → état convergé) | **1 504 ms** | — | — |

La part visible inclut l'action serveur Next.js, la revalidation, la navigation et — en mode
développement — la compilation à la demande de la route cible. Elle reste à deux ordres de grandeur
des dizaines de secondes signalées.

| Champ | Valeur |
| --- | --- |
| `CREATE_LATENCY_STATUS` · `P2_CREATE_LATENCY_STATUS` | **`NOT_REPRODUCED`** |
| `SWITCH_LATENCY_STATUS` · `P2_SWITCH_LATENCY_STATUS` | **`NOT_REPRODUCED`** |
| `CREATE_SWITCH_SHARED_ROOT_CAUSE` | **`NO`** — aucune cause commune n'est établie parce qu'aucun défaut de latence ne subsiste. Les deux flux partagent bien un composant (action serveur + `revalidatePath`) : c'est le premier endroit où regarder si le symptôme réapparaît, mais l'affirmer aujourd'hui serait inventer une cause à un effet absent |

Aucun seuil de performance serré n'est asserté dans la suite : une machine chargée ferait alors
échouer des tests de correction pour une raison sans rapport avec le produit. Les bornes posées ne
détectent que l'ordre de grandeur pathologique.

---

## 5. Double soumission et reprise réseau

| Champ | Valeur |
| --- | --- |
| `DOUBLE_CLICK_CREATE_STATUS` | **PROTÉGÉ** — double clic réel dans un navigateur : **1 seul** appel d'offres créé |
| `UI_CREATE_PENDING_STATUS` · `UI_SWITCH_PENDING_STATUS` | **PASS** — `disabled={isPending}` sur les deux contrôles, avec libellé d'attente |
| `CREATE_NETWORK_RETRY_STATUS` | **NON IDEMPOTENT** — voir ci-dessous |
| `CREATE_IDEMPOTENCY_GUARANTEE` | **`UI_PENDING_LOCK_ONLY`** |

Formulation exigée par la §10, et je la donne telle quelle : **un verrou d'interface n'est PAS une
idempotence de reprise réseau.** L'API n'expose aucune identité d'opération ; deux commandes
identiques sont, de son point de vue, deux créations légitimes — ce que la mesure confirme.

Ce qui a été vérifié plutôt que supposé : le client HTTP du produit **ne retente aucune requête**
(un seul `fetch`, aucune boucle de reprise). Aucun chemin produit ne peut donc dupliquer une
création automatiquement. Le risque résiduel est une re-soumission **manuelle** après une réponse
perdue — bornée par le verrou d'interface et l'affichage explicite du résultat.

`DUPLICATE_ACTION_RISK` = **bas et borné**. Conformément aux §10/§31, **aucune infrastructure
d'idempotence n'a été ajoutée** : le problème qui la justifierait n'est pas reproductible sur un
chemin produit. L'introduire « au cas où » aurait été construire une machinerie sans preuve.

`ERROR_RECOVERY_STATUS` — l'action serveur retourne l'erreur au formulaire sans naviguer ; un
rechargement converge vers l'état faisant foi en base, la fiche étant rendue depuis l'API.

---

## 6. Invariants préservés

| Champ | Valeur |
| --- | --- |
| `CANDIDATE_SWITCH_ARTEFACT_INVARIANT` | **PASS** — module `tenders` intégralement vert, artefacts historiques inchangés |
| `TENANT_RBAC_STATUS` | **PASS** — candidat d'une autre organisation refusé à la création **et** au changement, sans mutation |
| `ENTITLEMENT_REGRESSION` | **PASS** — module `billing` vert ; aucune double consommation de crédit AO |

---

## 7. Gates

| Gate | Résultat |
| --- | --- |
| `PRISMA_VALIDATE` | ✅ |
| `PRISMA_MIGRATE_STATUS` | ✅ 115 migrations, base à jour |
| `API_TYPECHECK` · `API_LINT` | ✅ 0 / 0 |
| `WEB_TYPECHECK` · `WEB_LINT` | ✅ 0 / 0 |
| `API_BUILD` · `WEB_BUILD` | ✅ |

`PRISMA_CHANGES` = **NONE** · `MIGRATIONS` = **NONE**.

| Suite | Résultat |
| --- | --- |
| `INTEGRATION_TEST_RESULTS` — correction (injection de panne) | **9 / 9** |
| `RUNTIME_TEST_RESULTS` — latence serveur mesurée | **2 / 2** |
| `BROWSER_TEST_RESULTS` — latence visible et double soumission | **2 / 2** |
| `UNIT_TEST_RESULTS` — `tenders` + `billing` | **673 / 673 tests, 96 / 96 fichiers** |

Aucun test ignoré, aucun délai augmenté pour masquer une lenteur, aucun assouplissement du throttle,
aucun processus tiers arrêté. `ENVIRONMENT_BLOCKED` = **non**.

---

## 8. `P2_REGISTER`

| Réf | Statut |
| --- | --- |
| `P2-CREATE-LATENCY` | **NOT_REPRODUCED** — mesuré serveur **et** navigateur |
| `P2-SWITCH-LATENCY` | **NOT_REPRODUCED** — idem |
| `DUPLICATE_ACTION_RISK` | **bas et borné** — verrou d'interface prouvé, aucune reprise automatique |
| `P2-I-FINAL-AUTHORIZATION-ORDER` | CLOSED (H.1) |
| `P2-I-FINAL-HTTP-CERTIFICATION` · `P2-DASHBOARD-SQL-CAPTURE` · `P2-AUTH-THROTTLE-E2E-BUCKET` · `P2-OUTBOX-HARNESS-SCOPED-PUBLISH` | → **H.4**, inchangés |
| `P2-VERSIONLESS-DOCUMENT` | → **H.5**, inchangé |
| `P2-UPLOAD-ASSOCIATION-ATOMICITY` | `MITIGATED_ACCEPTABLE`, inchangé |
| `P2-MULTI-ORG-UI` · `P2-CANDIDATE-NAVIGATION` | POST-2.1, inchangés |
| `DEFERRED-G-03` | → **H.6** |
| `P3-STALE-SWITCH-NO-VERSION` | **NOUVEAU** — l'API de bascule n'exige ni candidat attendu ni version ; une interface périmée peut écraser une sélection plus récente (§3) |

---

## 9. Fichiers et constats

| Champ | Valeur |
| --- | --- |
| `FILES_CREATED` | 3 — spec de correction, spec de latence, preuve navigateur |
| `FILES_MODIFIED` | 2 — `change-tender-candidate-company.use-case.ts` et sa spec unitaire |
| `FILES_DELETED` | 0 |

`P0_FINDINGS` = **0** · `P1_FINDINGS` = **0** — le risque d'état partiel a été **trouvé et corrigé**
dans ce checkpoint, avec preuve avant/après · `P2_FINDINGS` = 0 nouveau · `P3_FINDINGS` = 1.
