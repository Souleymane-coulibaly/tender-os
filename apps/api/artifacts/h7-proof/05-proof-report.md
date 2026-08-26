# H7 — PROOF GATE : backlog Outbox étranger vs événement propre

**Checkpoint** : TENDEROS-2.1-P2.3-E12.4 — H7 PROOF GATE
**Verdict** : `H7_CONFIRMED`

---

## A. Executive summary

`claimPendingBatch()` est **global par conception** (un worker de production doit servir tous les
tenants). En contexte de test, cela signifie qu'un `worker.tick()` déclenché par une suite réclame
d'abord les événements **les plus anciens**, qui appartiennent à **d'autres suites**. La reproduction
contrôlée le démontre de bout en bout, et va jusqu'à faire **échouer une suite réelle** :
`workspace-http` passe à froid (18/18) et échoue avec un backlog étranger de 500 événements
(17/18, `Test timed out in 5000ms`). La chaîne H7 → F2 est donc établie expérimentalement.

## B. Harness

Vraies implémentations exclusivement, contre la vraie table `outbox_events` :
`PrismaOutboxEventRepository.claimPendingBatch()`, `PublishPendingOutboxEventsUseCase`,
`OutboxPublisherWorker`. Aucune réimplémentation en mémoire de l'algorithme. Aucun worker automatique
concurrent (timers désactivés par le mécanisme d'environnement existant). Aucune modification du code
de production. Harness archivé ici : `harness-h7-proof.integration.spec.ts.txt`.

## C. Baseline

`batch size = 100` (défaut réel) · `staleProcessingThresholdMs = 5 min`.
**83 événements étrangers déjà réclamables** avant tout test (57 `PENDING` + 26 `PROCESSING` à bail
expiré) — voir `00-baseline.json`.

## D/E. Identités

`ORG_OWN` et `ORG_FOREIGN`, organisations distinctes. Les FOREIGN portent un `created_at`
strictement antérieur (−1 h) à l'OWN (−1 s), condition du scénario. Ids archivés par scénario.

## F/G/H/J/K/L. Résultats

| Scénario | Foreign | Lot 1 taille | Lot 1 foreign | Lot 1 own | OWN dans lot 1 | Ticks | Durée | Foreign traités avant OWN |
|---|---|---|---|---|---|---|---|---|
| **COLD** | 0 | 84 | 0 | 1 | **oui** | **1** | **78 ms** | 0 |
| **BACKLOG 100** | 100 | 100 | **100** | **0** | **non** | **2** | **2 069 ms** | 100 |
| **BACKLOG 500** | 500 | 100 | **100** | **0** | **non** | **6** | **11 052 ms** | 500 |

Preuve A+B (§7) : dans les deux scénarios avec backlog, les cinq premiers ids du lot réellement
retourné par `claimPendingBatch()` sont **exactement** des ids FOREIGN, et l'id OWN est absent
(`ownPresent: false`). Ce n'est donc pas une déduction depuis l'état final de la table.

**Impact temporel : ×26 à 100 événements, ×142 à 500.** À 500, la chaîne dépasse 11 s — soit plus du
double du budget de 5 000 ms par défaut de Vitest.

Note : le lot COLD contient 84 lignes, pas 1 — les 83 événements étrangers préexistants y figurent.
C'est la situation réelle du dépôt, pas un artefact du test.

## I. Backlog 1000

Non exécuté : les paliers 100 et 500 établissent déjà la relation causale et son amplitude (§9
autorise l'omission).

## M. Suite réelle — `workspace-http.integration.spec.ts`

| | Réclamables avant | Exit | Durée | Résultat |
|---|---|---|---|---|
| COLD | 0 | **0** | 88 s | 18 / 18 |
| BACKLOG 500 | 500 | **1** | 93 s | 1 échec / 17 |

Test en échec : *« BLOQUANT — mission §26/§31/§50 : full flow on RESPONSE_PACKAGE_VERSION once
VALIDATED — … both request and decision create real Notification rows … »*, cause
`Test timed out in 5000ms`. Ce test attend des `Notification` produites via l'Outbox : le backlog
étranger consomme le budget des ticks avant que son propre événement ne soit traité.

## N. Événements sans handler — `H7-002`

**CONFIRMÉ comme amplificateur, avec nuance.** 10/10 réclamés → ils **occupent bien des slots** de
lot. Statut final : `{"FAILED": 10}` — jamais `PUBLISHED` (correctif P1-002 du dépôt respecté). Mais
`stillClaimable = 0` immédiatement après : le backoff repousse `available_at` dans le futur. Ils
amplifient donc le backlog **par vagues successives**, pas en boucle immédiate.

## O. `PROCESSING` à bail expiré — `H7-003`

**CONFIRMÉ.** 5/5 reclaimés et consommant un slot. C'est le mécanisme derrière les 26 lignes
`PROCESSING` observées bloquées en base : leur organisation ayant disparu, elles échouaient sans fin
tout en restant éligibles à chaque expiration de bail.

## P. Cleanup (§16)

```
NEW_ORGANIZATION_LEAK = 0
NEW_OUTBOX_LEAK       = 0
organizations total   = 432  (identique à la baseline certifiée FIX-1 — H6 non réintroduit)
```

**Effet de bord à signaler** : les 83 événements étrangers préexistants ont été **traités** par les
ticks réels de la preuve (`PENDING` 57 → 0, `PROCESSING` 26 → 0 ; désormais `PUBLISHED` 812,
`FAILED` 25, `DEAD_LETTER` 104). Total inchangé à 941 : **aucune suppression**, uniquement des
transitions d'état effectuées par le worker de production lui-même. Ce n'est pas une purge de
résidus historiques, qui reste interdite et non faite.

## Q. Causes alternatives écartées

- *Lenteur intrinsèque de la suite* : réfutée — même suite, même machine, même commande ; seul le
  backlog change, et le résultat bascule de vert à rouge.
- *Contention CPU/mémoire* : réfutée — les durées totales sont quasi identiques (88 s vs 93 s) ;
  c'est **un test précis** qui expire, pas la suite qui ralentit globalement.
- *Contention PostgreSQL* : réfutée — aucun autre run concurrent, aucun verrou en attente.
- *Ordre des fichiers* : sans objet — un seul fichier exécuté dans les deux cas.

## R. Verdict

Les sept critères du §14 sont satisfaits : FOREIGN plus anciens présents (1), OWN plus récent (2),
batch size connu = 100 (3), `worker.tick()` réel (4), premier lot contenant 100 FOREIGN et 0 OWN (5),
OWN retardé de 1 à 6 ticks (6), impact temporel ×26 à ×142 avec échec d'une suite réelle (7).

```
H7_CONFIRMED
H7_STATUS   = CONFIRMED
H7-002      = CONFIRMÉ (amplificateur par vagues)
H7-003      = CONFIRMÉ (amplificateur permanent)
NEXT_ACTION = FIX_2A_TEST_OUTBOX_ISOLATION
```

Aucun correctif appliqué. `claimPendingBatch()`, le worker, le use case, les handlers, le repository,
le schéma Prisma et les helpers workspace/integrations sont **inchangés**.
