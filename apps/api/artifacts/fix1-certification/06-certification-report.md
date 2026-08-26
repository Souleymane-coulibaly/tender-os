# FIX-1 / H6 — Rapport de certification runtime

**Checkpoint** : TENDEROS-2.1-P2.3-E12.4 — FIX-1 REMEDIATION
**Verdict** : `FIX_1_CERTIFIED`

---

## A. Baseline

| | |
|---|---|
| Branche | `v2.1-fix-opportunity-gonogo-ux` |
| HEAD | `a895603bf3099e8e64f9de8f30ecc90162f96d20` |
| Node | v24.15.0 |
| pnpm | 10.17.0 |
| PostgreSQL | 17.10 (Debian) |
| Snapshot BEFORE | 2026-08-25T02:43 |

Résidus **historiques** présents avant RUN 1 (hors périmètre FIX-1, §14 — aucune purge effectuée) :
organizations 434 · users 587 · sessions 570 · tenders 92 · outbox_events 961 · audit_logs 548.
Dont **248 organisations** appartenant aux six familles certifiées.

---

## B/F. Commande exacte (identique RUN 1 et RUN 2)

```
pnpm vitest run \
  src/modules/pricing-schedule/interfaces/http/pricing-schedule-http.integration.spec.ts \
  src/modules/response-package/interfaces/http/response-package-http.integration.spec.ts \
  src/modules/submission-package/interfaces/http/submission-package-http.integration.spec.ts \
  src/modules/analysis/interfaces/http/analysis-http.integration.spec.ts \
  src/modules/extraction/interfaces/http/extraction-http.integration.spec.ts \
  src/modules/connectors/interfaces/http/connectors-http.integration.spec.ts \
  src/modules/submission/interfaces/http/submission-http.integration.spec.ts \
  --pool=forks --poolOptions.forks.singleFork
```

Aucune purge entre les deux runs (§15). Aucun autre run TenderOS concurrent.

## C/G. Résultats

| | Fichiers | Tests | Exit | Durée |
|---|---|---|---|---|
| RUN 1 | 7 / 7 | 139 / 139 | 0 | 426 s |
| RUN 2 | 7 / 7 | 139 / 139 | 0 | 371 s |

## E/I. Deltas de fuite

```
NEW_LEAK_DELTA_RUN_1 = 0
NEW_LEAK_DELTA_RUN_2 = 0
```

Mesurés par **différence d'ensembles d'identifiants** (organisations, utilisateurs, sessions), jamais
par soustraction de compteurs : un compteur ne distinguerait pas une fixture historique d'une fuite
nouvelle. Les ids sont archivés dans les snapshots, donc vérifiables sans rejouer les tests.

## J. Matrice attribuée par famille (organisations / utilisateurs / sessions nouvellement fuités)

| Suite | RUN 1 | RUN 2 |
|---|---|---|
| pricing-schedule (chiffrage) | 0 / 0 / 0 | 0 / 0 / 0 |
| response-package + submission-package | 0 / 0 / 0 | 0 / 0 / 0 |
| analysis | 0 / 0 / 0 | 0 / 0 / 0 |
| extraction | 0 / 0 / 0 | 0 / 0 / 0 |
| connectors | 0 / 0 / 0 | 0 / 0 / 0 |
| submission | 0 / 0 / 0 | 0 / 0 / 0 |

### Compteurs globaux

| Ressource | BEFORE | AFTER RUN 1 | AFTER RUN 2 |
|---|---|---|---|
| organizations | 434 | 432 | 432 |
| users | 587 | 585 | 585 |
| sessions | 570 | 568 | 568 |
| tenders | 92 | 83 | 83 |
| outbox_events | 961 | 941 | 941 |
| audit_logs | 548 | 485 | 485 |

**AFTER RUN 1 ≡ AFTER RUN 2 sur les six métriques** : aucune croissance inter-run.

La baisse BEFORE → AFTER RUN 1 (−2 organisations `package-org-a/b-http-…`) est expliquée et
documentée : ce sont des fixtures laissées par une exécution de certification *ad hoc* interrompue
manuellement quelques minutes avant le snapshot BEFORE, dont le nettoyage s'est achevé pendant
RUN 1. Elle n'affecte pas la métrique de fuite, qui ne compte que les ressources **apparues**.
RUN 2 s'est déroulé en environnement calme et ne présente aucune anomalie de ce type.

## K/L. Erreurs de teardown et d'arrière-plan

| Signature | RUN 1 | RUN 2 |
|---|---|---|
| `foreign key` / `constraint` | **0** | **0** |
| `outbox_events_organization_id_fkey` | **0** | **0** |
| échec `afterAll` | **0** | **0** |
| tâche refusée après la barrière (`was not started`) | **0** | **0** |
| `Unhandled error in background task` | 1 | 1 |

L'unique erreur de fond est identique dans les deux runs :

```
ERROR [BackgroundTaskRunner] Unhandled error in background task
  "extraction:<uuid>": Document extraction not found.
```

Classification : **non-H6**. Elle survient à la frontière du teardown de `pricing-schedule`, sur une
tâche d'extraction démarrée *pendant* le test et **attendue par la barrière `app.close()`** — donc
exactement le comportement contractuel de `BackgroundTaskRunner` (E12.3), et non une écriture après
la barrière. La ligne `DocumentExtraction` avait été supprimée par le scénario de test lui-même. La
tâche n'écrit rien, ne produit aucune violation FK, et ne laisse aucune fixture : le delta de fuite
est nul dans les deux runs. Déterministe (identique R1/R2), donc pas un signal de dégradation.

## M. Résidus historiques (séparés, non purgés)

248 organisations de familles certifiées + le reste du parc, accumulées entre le 15 et le 24 août
2026. Hors périmètre FIX-1 (§14) : leur purge fera l'objet d'un script séparé avec dry-run, après
certification du mécanisme.

## N. Findings non-H6

1. `extraction: Document extraction not found` — décrit ci-dessus. Suivi côté E12.5 §12.
2. H7 (backlog Outbox réclamé sans filtre d'organisation par les specs appelant `tick()`) —
   `DEFERRED_TO_FIX_2`, preuve déjà réunie, non traité ici.

## O. Verdict

```
FIX_1_CERTIFIED
H6_STATUS      = CLOSED
F1_TO_H6_CHAIN = CERTIFIED
NEXT_ACTION    = FIX_2_H7
```

`FILES_MODIFIED_DURING_CERTIFICATION` = **NONE** (hors artefacts de ce dossier).
