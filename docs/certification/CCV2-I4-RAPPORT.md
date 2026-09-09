# CCV2-I.4 — Retrait du code, des routes et des actions Legacy devenus morts

**Branche** : `v2.1-post-decom-tnr3-certification` · **HEAD** : `074551d` · travaux non commités
(contrainte « no commit / no push » maintenue).

---

## 1. `LEGACY_ROUTE_FINAL_MATRIX` — 29 → 15 routes

| Route | Statut | Justification |
| --- | --- | --- |
| `PATCH :clientId/legal-identity` | **REMOVED** | ne pouvait plus que refuser (409 depuis I.1) |
| `POST / PATCH :clientId/bank-accounts` | **REMOVED** | idem |
| `POST / PATCH :clientId/insurances` | **REMOVED** | idem |
| `POST / PATCH :clientId/certifications` | **REMOVED** | idem |
| `POST / PATCH :clientId/references` | **REMOVED** | idem |
| `POST :clientId/references/:refId/documents` | **REMOVED** | idem |
| `POST / PATCH :clientId/human-resources` | **REMOVED** | idem |
| `POST / PATCH :clientId/material-resources` | **REMOVED** | idem |
| `GET :clientId/profile` | KEPT — historique | agrégat, seule vue des lignes Legacy |
| `GET :clientId/legal-identity` · `bank-accounts` · `insurances` · `certifications` · `references` · `references/:id/documents` · `human-resources` · `material-resources` | **KEPT — historique** | voir §2 |
| `GET / POST :clientId/representatives` · `PATCH :clientId/representatives/:id` | **KEPT — CRM** | contacts commerciaux (I.1/I.2) |
| `POST :clientId/bank-accounts/:id/archive` | **KEPT — transitionnel** | seul moyen de neutraliser une ligne Legacy (I.2 §8) |
| `GET / POST :clientId/documents` | **KEPT — CRM** | documents commerciaux (I.3) |

| Métrique | Valeur |
| --- | ---: |
| `ROUTES_REMOVED` | **14** |
| `ROUTES_KEPT_COMMERCIAL` | 5 |
| `ROUTES_KEPT_HISTORICAL` | 9 |
| `ROUTES_KEPT_MIGRATION` | 1 (archivage transitionnel) |

**`SAFE_TO_REMOVE_PROOF`, commun aux 14** : chacune répondait `409 CLIENT_BIDDER_WRITE_RETIRED` à
**toutes** ses requêtes sans exception — leur unique fonction restante était de refuser. Recherche
exhaustive des consommateurs : 1 action web (retirée avec la route), 0 consommateur interne, 0
contrat public (aucun OpenAPI, SDK ni outil d'intégration dans le dépôt), 0 dépendance de migration,
0 dépendance d'accès historique — la lecture correspondante est conservée. Les seules références
subsistantes sont des **commentaires**.

Le retrait ne supprime aucune capacité produit : il remplace un refus applicatif par une **absence**.
C'est plus fort, puisqu'une absence de route ne peut pas être annulée par l'oubli d'une garde.

---

## 2. Pourquoi les lectures historiques restent

Après la migration CCV2-I.2, **8 `ClientAccount` par famille** portent encore des lignes Legacy sans
entreprise candidate (56 lignes, toutes inscrites au registre d'exceptions). Aucune fiche candidate
ne les affiche — c'est précisément pourquoi elles n'ont pas été migrées.

Supprimer ces lectures rendrait cette donnée **inaccessible depuis le produit**. La règle §3 tranche
sans ambiguïté : il existe une dépendance d'accès historique, donc on conserve et on documente. Les
mêmes rubriques restent affichées à l'écran, en lecture seule.

---

## 3. Comptes de retrait

| Métrique | Valeur |
| --- | ---: |
| `ROUTES_REMOVED` | 14 |
| `USE_CASES_REMOVED` | **14** |
| `WEB_ACTIONS_REMOVED` | **7** |
| `COMPONENTS_REMOVED` | 0 — 6 sections **réécrites** en lecture seule plutôt que supprimées (§2) |
| `DTO_SCHEMAS_REMOVED` | **2** (`UpsertCompanyLegalIdentityBodySchema`, `AttachCompanyReferenceDocumentBodySchema`) |
| `TESTS_REMOVED_OR_REWRITTEN` | **4 réécrits, 0 supprimé** |
| `DEAD_IMPORTS_REMOVED` | **113** (87 API + 26 web) |

Les 20 autres schémas sont **partagés avec les contrôleurs candidate** — les supprimer aurait cassé
la surface de remplacement. Vérifié référence par référence avant toute suppression.

Deux méthodes de dépôt devenues sans appelant ont également été retirées
(`CompanyLegalIdentityRepository.upsert` et `findDuplicateSiretInOrganization`) : ce dépôt est
désormais en **lecture seule**, et l'arbitrage des doublons de SIRET est assuré en base par l'index
unique de `candidate_establishments`.

### Ce qui n'a PAS été supprimé, et pourquoi

Les méthodes `create()` / `update()` de scope client des six autres dépôts satellites sont désormais
sans appelant côté client — mais elles appartiennent à un **port générique partagé** : `create()` sert
les capacités candidate (5 familles) et `update()` sert l'archivage bancaire transitionnel. Les
retirer exigerait de faire diverger l'interface pour un gain nul. Conservées, et signalées ici plutôt
que passées sous silence.

---

## 4. Tests : 4 réécrits, aucun supprimé

| Test | Traitement |
| --- | --- |
| I.1 — 7 domaines refusés en 409 | assertion **inversée en 404** : l'invariant n'est pas affaibli, il est renforcé |
| I.1 — rattachement documentaire d'une référence | 409 → 404, **plus** une nouvelle assertion que la LECTURE reste ouverte |
| Legacy — anti-mass-assignment (422) | **déplacé** sur `POST :clientId/representatives`, route CRM survivante au schéma `.strict()` |
| Legacy — `VIEWER` lecteur mais non gestionnaire (403) | moitié écriture **déplacée** sur la même route CRM |

Les deux derniers portaient des invariants de **sécurité toujours actifs**. Les supprimer avec leur
route aurait fait disparaître une couverture vivante : ils ont été déplacés, jamais effacés.

---

## 5. `FINAL_CLIENT_SURFACE`

Ce qu'un utilisateur peut encore **gérer** sur un `ClientAccount` :

- le compte commercial lui-même (CRUD, affectations, tarification) ;
- ses **contacts commerciaux** (`ADMINISTRATIVE_CONTACT`, `COMMERCIAL_CONTACT`, `TECHNICAL_CONTACT`) ;
- ses **documents commerciaux** (6 catégories CRM) ;
- l'**archivage** d'une ligne bancaire Legacy (transitionnel) ;
- la **consultation** en lecture seule de ses rubriques de candidature historiques.

**Aucun dossier de candidature actif.** Toute écriture de candidature a disparu de cette surface.

## 6. `FINAL_CANDIDATE_SURFACE`

`CandidateCompany` gère intégralement : identité juridique, établissements, représentants légaux et
signataires, banque, assurances, certifications, références, moyens humains et matériels, documents
de candidature. Vérifié par la suite candidate complète.

---

## 7. Invariants statiques (§36)

| Invariant | Valeur |
| --- | ---: |
| `CURRENT_CANDIDATE_COMPANYPROFILE_RUNTIME_COUNT` | **0** |
| `SOURCE_CLIENT_ACCOUNT_RUNTIME_FALLBACK_COUNT` | **0** |
| `NEW_BIDDER_DUAL_WRITE_SURFACE_COUNT` | **0** |
| `BIDDER_WRITE_BYPASS_COUNT` | **0** |
| `CLIENT_UPLOAD_AUTO_CANDIDATE_ASSOCIATION_COUNT` | **0** |
| `CANDIDATE_UPLOAD_AUTO_CLIENT_ASSOCIATION_COUNT` | **0** |

**Injection morte trouvée** : `GetDashboardOverviewUseCase` injectait encore
`GetCompanyProfileUseCase` sans jamais l'appeler — résidu de I.1, où le calcul de complétude candidate
avait été redirigé vers `CandidateCompany`. Retirée. En dehors du module `company-profile`, les seules
mentions restantes sont des **commentaires** (dont un qui documente précisément que ce use case n'est
jamais appelé là).

Deux gardes `assertClientBidderWriteRetired` subsistent, toutes deux sur les représentants : elles
distinguent l'autorité juridique du contact CRM sur une route volontairement conservée.

---

## 8. États conservés

| Champ | Valeur |
| --- | --- |
| `COMPANY_PROFILE_PAGE_STATUS` | CRM actif (contacts, documents commerciaux) + rubriques de candidature en **lecture seule** |
| `LEGACY_BANK_ARCHIVE_TARGET` | **`KEEP_TRANSITIONAL`** — inchangé |
| `DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_STATUS` | **`KEEP_COMMERCIAL_CERTIFIED`** |
| `P2_UPLOAD_ASSOCIATION_ATOMICITY_STATUS` | **`MITIGATED`** — I.4 ne touche aucun flux de dépôt, le statut reste inchangé |
| `DOCUMENT_INCOMPLETE_STATE_STATUS` | 1 document sans version, conservé, aucune route retirée ne peut recréer cet état |
| `CANDIDATE_NAVIGATION_STATUS` | **`GENERIC_LINK_ONLY`** — le lien générique reste présent dans chaque rubrique retirée |
| `MIGRATION_CODE_STATUS` | `KEEP_RELEASE_MIGRATION` + `KEEP_AUDIT_PROVENANCE` — **rien supprimé** |
| `SOURCE_CLIENT_ACCOUNT_ID_STATUS` | `KEEP_PERMANENTLY` (provenance) |
| `HISTORICAL_DATA_DELETED` | **0** |
| `DEFERRED_G_03_STATUS` | `DEFER_TO_ADMIN_FORMS_HARDENING` |
| `PRISMA_CHANGES` / `MIGRATIONS` | **NONE** — aucune migration destructive, aucun schéma touché |

---

## 9. Gates et tests

| Gate | Résultat |
| --- | --- |
| `PRISMA_VALIDATE` | ✅ schéma valide |
| `PRISMA_MIGRATE_STATUS` | ✅ 115 migrations, base à jour |
| `API_TYPECHECK` | ✅ 0 |
| `API_LINT` | ✅ 0 |
| `API_BUILD` | ✅ `dist/main.js` |
| `WEB_TYPECHECK` | ✅ 0 |
| `WEB_LINT` | ✅ 0 erreur (1 avertissement préexistant) |
| `WEB_BUILD` | ✅ compilé |

| Suite | Résultat |
| --- | --- |
| `TARGETED_TEST_RESULTS` — module `company-profile` complet | **156 / 156** |
| `SECURITY_TEST_RESULTS` + `RUNTIME_TEST_RESULTS` — `company-profile` + `candidate-company` + `client-portfolio` + `documents` + `dashboard` | **64 / 66 fichiers** — seul échec : les 2 `P2-DASHBOARD-SQL-CAPTURE` préexistants |
| `CLIENT_ASSIGNMENT_ISOLATION_STATUS` · `CANDIDATE_ISOLATION_STATUS` · `TENANT_ISOLATION_STATUS` · `BANKING_SECURITY_STATUS` | PASS — les preuves I.1/I.2/I.3 rejouées intactes |
| `DASHBOARD_CANDIDATE_SOT_STATUS` | PASS — 49 tests dashboard verts, complétude candidate lue depuis `CandidateCompany` |
| `HISTORICAL_ARTEFACT_STATUS` | inchangé |
| `BROWSER_TEST_RESULTS` | **4 / 4** |
| Chaîne I.1 + I.2 + I.3 + Legacy rejouée ensemble | **59 / 59** |

La preuve navigateur de la rubrique retirée a été **renforcée** : elle vérifiait qu'aucun contrôle
n'était actionnable, ce qui devenait vide de sens une fois le formulaire supprimé. Elle asserte
désormais qu'il n'existe **aucun** champ de saisie — une assertion qui échouerait si un formulaire
était réintroduit — tout en conservant le `fieldset disabled` comme filet natif.

Le lint a servi d'**instrument de mesure** du code mort plutôt que de simple contrôle : les 113
imports et symboles retirés l'ont été sous sa dictée, fichier par fichier, plutôt que d'après une
heuristique de recherche textuelle.

---

## 10. `P2_REGISTER`

| Réf | Statut |
| --- | --- |
| `P2-SWITCH-LATENCY` · `P2-CREATE-LATENCY` · `P2-MULTI-ORG-UI` · `P2-TENDER-1024-OVERFLOW` | reportés |
| `P2-DASHBOARD-SQL-CAPTURE` | reporté — 2 tests, préexistants |
| `P2-UPLOAD-ASSOCIATION-ATOMICITY` | **MITIGATED** (I.3), inchangé |
| `P2-CANDIDATE-DEEP-LINK` (I.2) | reporté |
| `P2-REGISTER-NOISE` (I.2) | reporté |
| `P2-VERSIONLESS-DOCUMENT` (I.3) | reporté |
| `P2-AUTH-THROTTLE-E2E-BUCKET` · `P2-OUTBOX-HARNESS-SCOPED-PUBLISH` · `P2-COMPLIANCE-PROBE-MISSING-MODULE` | reportés — préexistants |
| `P2-DASHBOARD-SEMANTIC-SOT` · `P2-CANDIDATE-FETCH-ERROR` · `P2-CLIENT-SATELLITE-READ-SEMANTIC` | **CLOS** |
| `P3-DEAD-CLIENT-SCOPE-REPOSITORY-METHODS` | **NOUVEAU** — 6 méthodes de scope client sans appelant, conservées car le port est partagé (§3) |
