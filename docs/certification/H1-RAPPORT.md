# H.1 — L'autorisation précède la validation métier

**Branche** : `v2.1-post-decom-tnr3-certification` · **HEAD** : `074551d` · travaux non commités
(contrainte « no commit / no push » maintenue).

Constat traité : `P2-I-FINAL-AUTHORIZATION-ORDER`.

---

## 1. `AFFECTED_USE_CASE_INVENTORY` — audit du fichier ACTUEL

Les numéros de ligne du rapport d'audit n'ont pas été repris tels quels (§2). Un audit automatisé a
parcouru **les 30 méthodes `execute`** du module `company-profile` et comparé, pour chacune, la
position de la première vérification d'accès à celle de la première validation métier protégée.

| Cas d'usage | Accès | Métier | Verdict initial |
| --- | ---: | ---: | --- |
| `CreateCompanyRepresentativeUseCase` | l. 67 | l. **63** | **ordre inversé** |
| `UpdateCompanyRepresentativeUseCase` | l. 119 | l. **115** | **ordre inversé** |
| 28 autres méthodes `execute` | — | — | ordre correct |

Le constat de l'audit indépendant est **confirmé, aux lignes exactes qu'il signalait**. Ce sont les
deux gardes *conditionnelles* que j'avais moi-même placées avant le contrôle d'accès en CCV2-I.1,
alors que j'avais corrigé toutes les autres : l'audit a vu ce que j'avais manqué.

`SIMILAR_ORDERING_FINDINGS_COUNT` = **2** — aucune autre occurrence du motif dans le module. Après
correction, le même audit rend **0**.

---

## 2. Correctif

Les deux gardes `isLegalAuthorityRepresentativeType` → `assertClientBidderWriteRetired` sont
déplacées **après** `assertClientAccess`. La règle métier ne s'applique donc plus qu'à un acteur
déjà autorisé.

**Contre-preuve exécutée** : gardes temporairement replacées avant l'accès → l'audit repasse à 2 et
les deux preuves de cas d'usage passent au rouge ; correctif rétabli, audit à 0, suite verte. Le
correctif porte réellement, ce n'est pas une réécriture cosmétique.

| Champ | Valeur |
| --- | --- |
| `CRM_CONTACT_AUTHORIZATION_ORDER` | **PASS** |
| `CREATE_AUTHORIZATION_ORDER` | **PASS** |
| `UPDATE_AUTHORIZATION_ORDER` | **PASS** |
| `DELETE_ARCHIVE_AUTHORIZATION_ORDER` | **N/A** — aucune route de suppression ni d'archivage de contact n'existe (vérifié, pas supposé) |
| `READ_AUTHORIZATION_ORDER` | **PASS** — `ListCompanyRepresentativesUseCase` vérifie l'accès en première instruction ; inchangé |

---

## 3. `UNAUTHORIZED_BUSINESS_VALIDATION_ORACLE = CLOSED`

Le §19 demande que deux requêtes non autorisées, ne différant que par leur validité métier, donnent
le même verdict. La mesure a révélé une nuance que l'énoncé de l'audit ne portait pas, et qu'il
serait malhonnête de passer sous silence :

**Sur la route HTTP, le type `SIGNATORY` n'atteint jamais le cas d'usage.** Depuis CCV2-I.1, le
schéma de la route CRM ne l'accepte pas : il est rejeté en `400` par la validation de schéma. La
différence observable en HTTP était donc `404` vs `400` — une frontière de **transport**, que la
mission §11 qualifie explicitement d'acceptable.

Cela ne diminue en rien le défaut : la garde métier s'exécutait bel et bien avant l'autorisation, et
le cas d'usage est appelable autrement que par cette route. La preuve a donc été portée **au niveau
du cas d'usage**, là où aucun schéma ne s'interpose et où l'ordre réel est directement observable.

Trois preuves, résolues depuis le conteneur d'injection réel :

1. acteur non autorisé + type juridique → l'erreur levée **n'est pas** `ClientBidderWriteRetiredError`
   (c'est l'erreur d'accès), et rien n'est écrit ;
2. même invariant sur la mise à jour, la cible restant intacte ;
3. **contre-preuve** : pour un acteur *autorisé*, la règle métier s'applique toujours — sans elle,
   déplacer la garde puis la neutraliser produirait le même vert.

Et deux preuves HTTP qui établissent la distinction §11 plutôt que de l'affirmer :

4. le `400` sur type juridique est **identique** pour un acteur autorisé et pour un acteur qui ne
   l'est pas — c'est une propriété statique du contrat d'API, pas un oracle sur l'autorisation ;
5. pour deux charges utiles **acceptées par le contrat**, l'acteur non autorisé obtient le même
   verdict d'autorisation.

---

## 4. Isolation et RBAC

| Champ | Valeur |
| --- | --- |
| `CLIENT_AB_ISOLATION_STATUS` | **PASS** — un contact du client B n'est pas modifiable par la route du client A (`404`), avec contre-preuve que le même acteur gère bien le contact de SON client |
| `CROSS_TENANT_STATUS` | **PASS** — `404` anti-énumération inter-organisations |
| `VIEWER_RBAC_STATUS` | **PASS** — lecture `200`, mutation `403` |
| `MASS_ASSIGNMENT_REGRESSION` | **PASS** — champ inconnu rejeté (`400`), `.strict()` intact |
| `AUTHORIZED_CRM_CONTACT_REGRESSION` | **PASS** — création et mise à jour de contact CRM opérationnelles |
| `CANDIDATE_REPRESENTATIVE_REGRESSION` | **PASS** — module `candidate-company` intégralement vert |

Les sondes hostiles sont menées par un `CONTRIBUTOR` affecté au **seul** client A, jamais par
l'`OWNER` : le modèle d'accès étant à deux paliers, un rôle d'organisation détenant déjà la
permission traverse légitimement les affectations et ne prouverait rien sur le cloisonnement.

---

## 5. Invariants statiques (§24)

| Invariant | Valeur |
| --- | ---: |
| `CRM_CONTACT_AUTHORIZATION_ORDER` | **PASS** |
| `UNAUTHORIZED_BUSINESS_VALIDATION_ORACLE` | **CLOSED** |
| `CURRENT_CANDIDATE_COMPANYPROFILE_RUNTIME_COUNT` | **0** |
| `SOURCE_CLIENT_ACCOUNT_RUNTIME_FALLBACK_COUNT` | **0** |
| `NEW_BIDDER_DUAL_WRITE_SURFACE_COUNT` | **0** |
| `BIDDER_WRITE_BYPASS_COUNT` | **0** |

| Champ | Valeur |
| --- | --- |
| `BANKING_REGRESSION_STATUS` | **PASS** — aucun code bancaire touché ; `LEGACY_BANK_ARCHIVE_TARGET` inchangé |
| `DOCUMENT_REGRESSION_STATUS` | **PASS** — aucun code documentaire touché ; aucun refactor de symétrie entrepris (§17) |

---

## 6. Gates et tests

| Gate | Résultat |
| --- | --- |
| `PRISMA_VALIDATE` | ✅ schéma valide |
| `PRISMA_MIGRATE_STATUS` | ✅ 115 migrations, base à jour |
| `API_TYPECHECK` | ✅ 0 |
| `API_LINT` | ✅ 0 |
| `API_BUILD` | ✅ |
| `WEB_TYPECHECK` | ✅ 0 |
| `WEB_LINT` | ✅ 0 erreur |
| `WEB_BUILD` | ✅ |

| Suite | Résultat |
| --- | --- |
| `SECURITY_TEST_RESULTS` + `UNIT_TEST_RESULTS` + `HTTP_TEST_RESULTS` — spec H.1 | **12 / 12** |
| Régression `company-profile` + `candidate-company` | **343 / 343 tests, 32 / 32 fichiers** |

Aucun test ignoré, aucun délai augmenté, aucun assouplissement du throttle, aucun processus tiers
arrêté. Les problèmes d'environnement listés au §22 n'ont pas été rencontrés sur ce périmètre :
`ENVIRONMENT_BLOCKED` = **non**.

---

## 7. `P2_REGISTER`

| Réf | Statut |
| --- | --- |
| `P2-I-FINAL-AUTHORIZATION-ORDER` | **CLOSED** — prouvé, avec contre-preuve |
| `P2-I-FINAL-HTTP-CERTIFICATION` | reporté |
| `P2-CREATE-LATENCY` · `P2-SWITCH-LATENCY` · `P2-TENDER-1024-OVERFLOW` | reportés |
| `P2-UPLOAD-ASSOCIATION-ATOMICITY` | `MITIGATED_ACCEPTABLE` |
| `P2-DASHBOARD-SQL-CAPTURE` · `P2-VERSIONLESS-DOCUMENT` | reportés |
| `P2-AUTH-THROTTLE-E2E-BUCKET` · `P2-OUTBOX-HARNESS-SCOPED-PUBLISH` | reportés |
| `P2-MULTI-ORG-UI` · `P2-CANDIDATE-NAVIGATION` | acceptés/différés POST-2.1 |
| `DEFERRED-G-03` | reste **H.6** |

---

## 8. Fichiers et constats

| Champ | Valeur |
| --- | --- |
| `FILES_CREATED` | 1 — `h1-crm-contact-authorization-order.integration.spec.ts` |
| `FILES_MODIFIED` | 1 — `company-representative.use-cases.ts` |
| `FILES_DELETED` | 0 |
| `PRISMA_CHANGES` | **NONE** |
| `MIGRATIONS` | **NONE** |

`P0_FINDINGS` = **0** · `P1_FINDINGS` = **0** · `P2_FINDINGS` = 0 nouveau · `P3_FINDINGS` = 0.
