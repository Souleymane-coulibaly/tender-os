# H.4 — Herméticité des tests et environnement de certification

**Branche** : `v2.1-post-decom-tnr3-certification` · **HEAD** : `074551d` · travaux non commités
(contrainte « no commit / no push » maintenue).

---

## 1. `NODE_PROCESS_BASELINE`

Inventaire avant toute exécution : **15 processus Node**, dont quatre liés aux ports 3000-3002 et
4000, et **quatre superviseurs `nest start --watch`** concurrents sur le même dépôt.

Origine établie par ligne de commande et horodatage : ce sont des **orphelins de mes propres
serveurs de développement**, laissés par les checkpoints précédents de cette session. Deux processus
antérieurs à la session (`node dist/main.js` et `next start -p 3220`, du 06/09) ont été **conservés
et jamais arrêtés** — ils forment une pile en mode production qui ne m'appartient pas (§2).

**Cause du problème d'arrêt** : `pnpm --filter X dev` engendre un enfant (`nest` / `next`) qui
engendre lui-même le serveur. Arrêter le processus `pnpm` ne récupère pas l'arbre sous Windows :
chaque cycle démarrage/arrêt laissait donc une application vivante — et le worker Outbox avec elle.

Mesuré après un cycle complet de cette session : **4 orphelins**, tenant encore les ports 3000 et
4000. Récupérés explicitement, puis vérifié : `TEST_OWNED_NODE_PROCESS_LEAK_COUNT` = **0**, ports
libres, pile préexistante intacte.

`CERTIFICATION_WORKTREE_SCOPE` — l'arbre de travail reste **MIXED_BUT_TRACEABLE** ; aucun artefact
généré n'a été nettoyé ni réinitialisé (§28). Le périmètre certifié ici est `apps/api/src`,
`apps/web/src` et `tests/`.

---

## 2. `P2-OUTBOX-HARNESS-SCOPED-PUBLISH` → **CLOSED**

### Ce que la mesure a montré

Diagnostic isolé : 100 lignes insérées, **aucun appel du harnais**, observation passive.

| t | Statuts |
| --- | --- |
| 0 | `PENDING × 100` |
| +1 s | `PROCESSING × 97`, `FAILED × 3` |
| +2 s | `FAILED × 100` |

Un worker Outbox externe réclamait donc les fixtures. Le harnais, lui, rendait `claimed: 1` et ne
touchait qu'à l'événement demandé : **il faisait exactement ce qu'il promettait.**

### Le vrai coupable

Non pas la pile préexistante de l'utilisateur, mais **l'orphelin de ma propre session** — une
instance API relancée en boucle par un superviseur `--watch` non récupéré. Sur environnement
réellement propre, les 100 lignes restent `PENDING` avant comme après l'appel.

### Correction — TEST UNIQUEMENT

Les fixtures naissent désormais **inéligibles** (`available_at` repoussé), et le harnais est
interrogé avec un `now` postérieur. De son point de vue à lui, toutes les lignes sont donc
parfaitement éligibles : **seule leur absence de la liste d'identifiants les protège**. La preuve
devient plus forte qu'avant — elle ne peut plus être satisfaite par un filtre temporel.

Une première tentative posait `available_at` **après** l'insertion : encore instable (1 échec sur 3),
car les 100 insertions laissent une fenêtre d'environ une seconde. La correction retenue rend les
lignes inéligibles **dès leur création**. Le seul `PROCESSING` expiré du fichier reste délibérément
éligible : le rendre inéligible viderait son test de son sens.

| Champ | Valeur |
| --- | --- |
| `OUTBOX_TEST_HERMETICITY_STATUS` | **PASS** — la spec passe **malgré** un worker concurrent |
| `OUTBOX_WORKER_LIFECYCLE_STATUS` | **correct par conception** — `clearInterval` + attente du tick en vol (E12.3), inchangé |
| `SCOPED_OUTBOX_HARNESS_STATUS` | **correct** — `WHERE id IN (...)`, prouvé et non supposé |
| `TEST_OWNED_OUTBOX_WORKER_LEAK_COUNT` | **0** |

Le worker de production reste **global par conception** (§8) : aucune sémantique produit n'a été
touchée.

---

## 3. `P2-DASHBOARD-SQL-CAPTURE` → **CLOSED**, mais c'était un DÉFAUT PRODUIT

L'instrumentation a révélé que la capture voyait **zéro requête**. `$on("query")` fonctionne pourtant
parfaitement en isolation — vérifié séparément.

**Cause racine** : deux modules `@Global()` fournissaient `PrismaService` — `DatabaseModule` et
`CandidateDocumentAccessBridgeModule` (ajouté en CCV2-D). Il existait donc **deux instances, donc
deux pools de connexions**, en contradiction directe avec l'invariant que ce service documente
lui-même. La spec instrumentait une instance ; le tableau de bord utilisait l'autre.

Ce n'était donc ni une assertion périmée ni un défaut de capture : le test révélait — de façon
opaque — un **vrai défaut produit**. Le pont n'avait aucun besoin de re-déclarer un service déjà
global ; son dépôt local, lui, reste en place car c'est ce qui évite le cycle de modules.

Après retrait du fournisseur dupliqué : **36 requêtes capturées**, dont `response_packages`, et
**16/16** tests verts.

| Champ | Valeur |
| --- | --- |
| `DASHBOARD_SQL_CAPTURE_STATUS` | **PRODUCT_DEFECT_REVEALED_BY_CAPTURE** → corrigé |
| `DASHBOARD_QUERY_PRODUCT_STATUS` | **PASS** — agrégation `GROUP BY` réelle, filtre `clientId` appliqué par PostgreSQL, aucun repli `CompanyProfile` |

C'est le seul changement de comportement produit de ce checkpoint, et le §27 l'autorise
explicitement : défaut produit authentique, découvert indépendamment.

---

## 4. `P2-AUTH-THROTTLE-E2E-BUCKET` → **CLOSED**

`dashboard.spec.ts` effectuait **7 connexions réelles** dans un même fichier, épuisant le bucket
`auth` (10 / 60 s) : ses deux derniers tests échouaient sur un vrai `429`, sans rapport avec ce
qu'ils vérifiaient.

Le helper de réutilisation de session (`ensureLoggedIn`, mémoire + disque, avec **vérification** de
validité) existait déjà mais n'était pas employé ici. Une seule connexion réelle est **conservée
délibérément** sur le premier test : la stratégie de session ne doit pas faire disparaître la preuve
que l'authentification fonctionne (§15).

| Champ | Valeur |
| --- | --- |
| `AUTH_THROTTLE_PRODUCTION_STATUS` | **INCHANGÉ** — aucune limite touchée |
| `AUTH_TEST_STRATEGY_STATUS` | 1 connexion réelle + 6 réutilisations |
| `AUTH_ACTOR_ISOLATION_STATUS` | **PASS** — les sessions sont indexées par e-mail ; les preuves hostiles (H.1, I.3) continuent d'utiliser des acteurs réellement distincts |

Résultat : **7/7**, sur **3 exécutions consécutives**.

---

## 5. `P2-I-FINAL-HTTP-CERTIFICATION` → **CLOSED**

| Champ | Valeur |
| --- | --- |
| `I_HTTP_CERTIFICATION` | **PASS** |
| `H1_HTTP_REGRESSION` | **PASS** — le contrat sémantique H.1 (rejet de transport distinct de l'oracle métier certifié au niveau du cas d'usage) n'a **pas** été réécrit |
| `CCV2_I_CHAIN_STATUS` | **PASS** |
| `H1_REGRESSION_STATUS` · `H2_REGRESSION_STATUS` | **PASS** |

Les trois specs HTTP CCV2-I atteignent un résultat terminal réel, jamais déduit de tests unitaires.

---

## 6. Répétabilité (§24)

Jeu complet : harnais Outbox + bornage SQL dashboard + chaîne I.1/I.2/I.3 + H.1 + H.2.

| Exécution | Résultat |
| --- | --- |
| `REPEATABILITY_RUN_1` | **90 / 90** |
| `REPEATABILITY_RUN_2` | **90 / 90** |
| `REPEATABILITY_RUN_3` | **90 / 90** |

**Honnêteté sur le chemin parcouru** : une première série avait donné 90 / 1 échec / 90. Le test
défaillant était un **autre** test du fichier Outbox (« isolates scenario A from scenario B »), qui
souffrait de la même cause. J'ai donc généralisé l'herméticité à tout le fichier plutôt que de
rustiner le seul test signalé — et c'est seulement après cela que les trois exécutions consécutives
ont été obtenues. Déclarer CLOSED sur la première série aurait été prématuré.

---

## 7. Isolation et cycle de vie

| Champ | Valeur |
| --- | --- |
| `TEST_DATABASE_ISOLATION_STATUS` | **PASS** — chaque spec certifiée crée son organisation par `randomUUID()` et nettoie son propre périmètre |
| `TEST_CLEANUP_OWNERSHIP_STATUS` | **PASS** — aucun `deleteMany({})` global dans les specs certifiées ; tous les nettoyages sont bornés par `organizationId` |
| `SERVER_LIFECYCLE_STATUS` | **PASS après correction de procédure** — port 0 (attribution dynamique), fermeture par `app.close()` ; le défaut résiduel était l'arbre de processus des serveurs de développement, désormais récupéré explicitement |
| `TEST_OWNED_NODE_PROCESS_LEAK_COUNT` | **0** |
| `PLAYWRIGHT_LIFECYCLE_STATUS` | **PASS** — `workers: 1`, réutilisation de session vérifiée, cible de serveur explicite |

---

## 8. Diff produit

| Champ | Valeur |
| --- | --- |
| `PRODUCTION_CODE_FILES_MODIFIED` | **1** — `candidate-document-access-bridge.module.ts` |
| `PRODUCTION_BEHAVIOR_CHANGES` | **1**, justifié : suppression d'un fournisseur `PrismaService` dupliqué (§3). Sans lui, la correction du bornage SQL était impossible et un second pool de connexions subsistait |
| `FILES_MODIFIED` (tests) | 2 — `scoped-outbox-test-harness.integration.spec.ts`, `tests/dashboard.spec.ts` |
| `FILES_CREATED` · `FILES_DELETED` | 0 · 0 |
| `PRISMA_CHANGES` · `MIGRATIONS` | **NONE** · **NONE** |

Aucun throttle assoupli, aucun délai augmenté, aucun test ignoré, aucune reprise automatique, aucun
processus tiers arrêté.

---

## 9. Gates

| Gate | Résultat |
| --- | --- |
| `PRISMA_VALIDATE` · `PRISMA_MIGRATE_STATUS` | ✅ · ✅ 115 migrations |
| `API_TYPECHECK` · `API_LINT` · `API_BUILD` | ✅ 0 · ✅ 0 · ✅ |
| `WEB_TYPECHECK` · `WEB_LINT` · `WEB_BUILD` | ✅ 0 · ✅ 0 · ✅ |

| Suite | Résultat |
| --- | --- |
| `INTEGRATION_TEST_RESULTS` + `HTTP_TEST_RESULTS` | **90 / 90**, trois fois de suite |
| `UNIT_TEST_RESULTS` — harnais Outbox seul | **5 / 5**, trois fois de suite |
| `BROWSER_TEST_RESULTS` | dashboard **7 / 7** (×3) · séparation client/candidate et latence H.2 **6 / 6** |

---

## 10. Registres

`P2_REGISTER`

| Réf | Statut |
| --- | --- |
| `P2-I-FINAL-HTTP-CERTIFICATION` | **CLOSED** |
| `P2-DASHBOARD-SQL-CAPTURE` | **CLOSED** — défaut produit corrigé |
| `P2-AUTH-THROTTLE-E2E-BUCKET` | **CLOSED** |
| `P2-OUTBOX-HARNESS-SCOPED-PUBLISH` | **CLOSED** — reclassé contamination d'environnement, herméticité prouvée |
| `P2-CREATE-LATENCY` · `P2-SWITCH-LATENCY` | `CLOSED_NOT_REPRODUCED` (H.2), inchangés |
| `P2-UPLOAD-ASSOCIATION-ATOMICITY` | `MITIGATED_ACCEPTABLE`, inchangé |
| `P2-TENDER-1024-OVERFLOW` | → **H.3** |
| `P2-VERSIONLESS-DOCUMENT` | → **H.5** |
| `P2-MULTI-ORG-UI` · `P2-CANDIDATE-NAVIGATION` | `ACCEPT_POST_2_1` |
| `DEFERRED-G-03` | → **H.6** |
| `P2-DEV-SERVER-PROCESS-TREE` | **NOUVEAU** — `pnpm ... dev` ne récupère pas son arbre de processus à l'arrêt ; chaque cycle laisse une application vivante et son worker Outbox. Procédure de récupération explicite désormais documentée et vérifiée |

`P3_REGISTER` — `P3-STALE-SWITCH-NO-VERSION` (H.2), inchangé.

---

`P0_FINDINGS` = **0** · `P1_FINDINGS` = **0** · `P2_FINDINGS` = 1 nouveau (§10) · `P3_FINDINGS` = 0.
