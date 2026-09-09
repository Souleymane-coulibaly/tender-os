# CCV2-I.2 — Migration des données bidder Legacy & retrait des surfaces client

**Branche** : `v2.1-post-decom-tnr3-certification` · **HEAD** : `074551d` · travaux non commités
(contrainte « no commit / no push » maintenue).

**Base de données** : `localhost:5432/tenderos`, conteneur Docker `postgres:17` — **LOCALE, NON
PRODUCTION**.

---

## 1. `LOCAL_DB_DATA_MATRIX` — état avant migration

Inventaire reconstruit depuis la base réelle, sans reprendre aucun compte antérieur.

| Domaine | Total | Candidate natif | Double lien | Legacy seul | Orphelin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Représentants | 68 | 44 | 1 | 23 | 0 |
| Comptes bancaires | 27 | 3 | 1 | 23 | 0 |
| Assurances | 24 | 0 | 1 | 23 | 0 |
| Certifications | 24 | 0 | 1 | 23 | 0 |
| Références | 24 | 0 | 1 | 23 | 0 |
| Moyens humains | 24 | 0 | 1 | 23 | 0 |
| Moyens matériels | 24 | 0 | 1 | 23 | 0 |
| Identité juridique | 10 | — | — | 10 | 0 |
| Documents client (CRM) | 0 | — | — | 0 | — |
| Documents candidate | 10 | 10 | — | — | — |

**Constat structurel** : `company_legal_identities` **ne possède aucune colonne**
`candidate_company_id`. L'identité n'a donc jamais été migrée par association et ne peut pas l'être :
son contenu est porté nativement par `CandidateCompany` / `CandidateEstablishment` (exclusion
explicite et documentée du backfill CCV2-B). Sept familles seulement portent la double clé.

Classification des 23 lignes Legacy de chaque famille, via le pont déterministe
`CandidateCompany.sourceClientAccountId` : **15 `DETERMINISTICALLY_MIGRATABLE`**,
**8 `NO_CANDIDATE_AVAILABLE`** (aucun candidat rattaché à CE client), **0 ambiguë**.

---

## 2. `MIGRATION_RESULT_MATRIX` — exécution réelle

| Domaine | Migrées | Candidate-owned après | Legacy restant | Total avant → après |
| --- | ---: | ---: | ---: | --- |
| Représentants | 15 | 60 | 8 | 68 → **68** |
| Comptes bancaires | 15 | 19 | 8 | 27 → **27** |
| Assurances | 15 | 16 | 8 | 24 → **24** |
| Certifications | 15 | 16 | 8 | 24 → **24** |
| Références | 15 | 16 | 8 | 24 → **24** |
| Moyens humains | 15 | 16 | 8 | 24 → **24** |
| Moyens matériels | 15 | 16 | 8 | 24 → **24** |

**105 lignes migrées, 0 échec.** Le total par famille est **strictement inchangé** : le modèle est
par ASSOCIATION — seule `candidate_company_id` est écrite, jamais une ligne créée, copiée ou
supprimée. `INVARIANT_TOTAL_ROWS = PRESERVED`, vérifié par assertion et non par lecture.

`MIGRATION_IDEMPOTENCE_STATUS = PROVEN` — second passage complet : **0 ligne migrée**, aucun doublon,
aucune entrée de registre dupliquée.

`MIGRATION_TRANSACTION_STATUS = PER_CANDIDATE_UNIT` — une transaction par entreprise candidate : les
7 familles d'un même candidat migrent ensemble ou pas du tout, sans transaction géante inter-organisations.

---

## 3. `MIGRATION_EXCEPTION_MATRIX`

Registre existant réutilisé (`candidate_migration_register`), **aucun registre parallèle créé**.

| Motif | Statut | Entrées | Lignes Legacy couvertes |
| --- | --- | ---: | ---: |
| `NO_CANDIDATE_COMPANY` | `PENDING_PRODUCT_DECISION` | 191 | 56 |

Couverture vérifiée : les **8/8** clients portant encore des lignes Legacy ont une entrée de registre.
Toute ligne non migrée a donc un état explicable.

**Aucune migration de schéma n'a été nécessaire pour les motifs demandés au §4**, et c'est un
résultat, pas un contournement : `MULTIPLE_CANDIDATES` est **structurellement impossible**, l'index
unique `candidate_companies(organization_id, source_client_account_id)` interdisant qu'un
`ClientAccount` corresponde à plus d'une `CandidateCompany`. Les deux motifs existants suffisent
donc à décrire la réalité — en ajouter par convenance de nommage aurait été une migration inutile.

---

## 4. `REPRESENTATIVE_CLASSIFICATION` — défaut de migration trouvé et corrigé

`company_representatives` porte **deux sémantiques dans la même table**. Le backfill CCV2-B les
migrait **indistinctement** : un `COMMERCIAL_CONTACT` — donnée CRM légitime du client selon la
frontière posée en I.1 — aurait changé de propriétaire, puis **disparu de l'interface client** une
fois la lecture bornée aux lignes Legacy (§17).

Le défaut ne se voyait pas sur le jeu de données courant, où toutes les lignes Legacy sont des
`SIGNATORY`. Il est corrigé **par construction**, via un prédicat d'éligibilité par famille réutilisant
la notion d'autorité juridique de I.1, et non par chance de la donnée.

| Classification | Types | Destination | Comptage courant |
| --- | --- | --- | ---: |
| `CANDIDATE_REPRESENTATIVE` | `LEGAL_REPRESENTATIVE`, `SIGNATORY` | `CandidateCompany` | 15 migrés (23 Legacy → 8 restants) |
| `COMMERCIAL_CONTACT` | `ADMINISTRATIVE_CONTACT`, `COMMERCIAL_CONTACT`, `TECHNICAL_CONTACT` | reste `ClientAccount` | 0 côté Legacy client, 33 côté candidate natif |
| `AMBIGUOUS` | — | jamais converti automatiquement | **0** |
| `HISTORICAL_ONLY` | lignes sans pont candidat | préservées + registre | 8 |

---

## 5. `LEGACY_READ_LEAK_MATRIX`

Chaque ligne a été **reproduite par un test avant correction**, jamais déduite du code.

| Domaine | Ligne double lien | Route client | Permission client | Permission candidate | Donnée exposée | Fuite sémantique | Fuite sécurité | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Banking | oui | `GET /clients/:id/bank-accounts` | `ReadCompanyBanking` (rang client) | `candidate:read_banking` (rang org) | IBAN | oui | **oui** | corrigé en **I.1** |
| Représentants | oui | `/representatives` | `ReadCompanyProfile` | `candidate:read` | identité signataire | oui | non | **borné en I.2** |
| Assurances | oui | `/insurances` | `ReadCompanyProfile` | `candidate:read` | attestations | oui | non | **borné en I.2** |
| Certifications | oui | `/certifications` | `ReadCompanyProfile` | `candidate:read` | certifications | oui | non | **borné en I.2** |
| Références | oui | `/references` | `ReadCompanyProfile` | `candidate:read` | références | oui | non | **borné en I.2** |
| Moyens humains | oui | `/human-resources` | `ReadCompanyProfile` | `candidate:read` | effectifs | oui | non | **borné en I.2** |
| Moyens matériels | oui | `/material-resources` | `ReadCompanyProfile` | `candidate:read` | matériel | oui | non | **borné en I.2** |
| Documents client | non | `/documents` | `ReadCompanyProfile` | — | commercial | non | non | `KEEP_COMMERCIAL` |

**Classification assumée, sans surclassement.** Le bancaire est le seul cas de SÉCURITÉ : la
permission client s'obtient par simple affectation sur un client, tandis que `candidate:read_banking`
est de rang organisation — la permission la plus facile à obtenir déterminait donc l'accès à l'IBAN.
Les six autres familles sont gardées des deux côtés par une lecture de base de rang équivalent
(`ReadCompanyProfile` / `candidate:read`) : la donnée était présentée sous le mauvais propriétaire,
sans franchissement de palier de confidentialité. Transposer la sensibilité bancaire à ces domaines
aurait été une inflation de gravité, ce que la mission §16 interdit explicitement.

---

## 6. Défaut de sécurité trouvé en I.2 : IDOR inter-clients en lecture

`GET /clients/:id/references/:referenceId/documents` listait les pièces par `companyReferenceId`
seul, borné à la seule **organisation**. Un acteur autorisé sur le client A pouvait donc lire les
pièces d'une référence du client **B** en fournissant son identifiant. La frontière d'organisation
tenait ; la frontière de **client** — exactement ce que `ClientAssignment` promet — non.

Même famille que la régression P0 corrigée à l'audit Codex sur l'archivage bancaire, côté LECTURE
cette fois. Reproduit (200 au lieu de 404), puis corrigé : la référence est désormais résolue **dans
le scope du client** avant toute lecture, avec `404` — jamais `403` — pour préserver la convention
anti-énumération du module.

---

## 7. Écriture

| Métrique | Valeur |
| --- | ---: |
| `LEGACY_BIDDER_WRITE_PATH_COUNT` | **18** (17 gardés + archivage) |
| `LEGACY_BIDDER_WRITE_BYPASS_COUNT` | **0** |

Audit exhaustif : **toutes** les écritures sur les 9 tables satellites, tous modules confondus, sont
confinées aux dépôts de `company-profile/infrastructure` — aucun autre module, tâche de fond, import
ou commande imbriquée n'y touche. Aucune route `DELETE` n'existe. Les 18 routes d'écriture sont
prouvées à l'exécution : aucune n'atteint une donnée candidate-owned.

`REFERENCE_DOCUMENT_ATTACHMENT_STATUS = RETIRED_AND_SCOPED` — fermé en I.1 (garde), et désormais
également borné au scope client (I.2).

---

## 8. `LEGACY_BANK_ARCHIVE_TARGET = KEEP_TRANSITIONAL`

L'archivage reste ouvert, et c'est désormais **structurellement sûr** plutôt que conventionnellement
sûr : il passe par `update`, borné au périmètre Legacy (`candidateCompanyId IS NULL`). Prouvé à
l'exécution — archiver un compte candidate-owned répond `404`, la ligne reste `ACTIVE` et son
propriétaire métier inchangé ; archiver une ligne historique fonctionne toujours (contre-preuve sans
laquelle le test serait aussi satisfait par un archivage cassé).

Il reste transitionnel : sans lui, les lignes Legacy deviendraient définitivement inneutralisables
depuis leur seule surface de gestion.

---

## 9. États par domaine

| Champ | Valeur |
| --- | --- |
| `BANKING_MIGRATION_STATUS` | 15 migrées · 8 en registre · isolation I.1 préservée et re-prouvée |
| `INSURANCE_MIGRATION_STATUS` | 15 migrées · 8 en registre · lecture client bornée |
| `CERTIFICATION_MIGRATION_STATUS` | 15 migrées · 8 en registre · lecture client bornée |
| `REFERENCE_MIGRATION_STATUS` | 15 migrées · 8 en registre · lecture bornée + IDOR corrigé |
| `HUMAN_RESOURCE_MIGRATION_STATUS` | 15 migrées · 8 en registre · lecture client bornée |
| `MATERIAL_RESOURCE_MIGRATION_STATUS` | 15 migrées · 8 en registre · lecture client bornée |
| `DOCUMENT_MIGRATION_STATUS` | inchangé — périmètre explicite de **I.3** (§15) |
| `DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_STATUS` | `KEEP_COMMERCIAL` — conservée, non supprimée |
| `COMPANY_PROFILE_PAGE_STATUS` | `READ_ONLY_HISTORICAL` pour les 7 rubriques bidder ; contacts et documents commerciaux restent des fonctions client actives |
| `CANDIDATE_NAVIGATION_STATUS` | `GENERIC_LINK_ONLY` (voir §11) |
| `CLIENT_COMMERCIAL_SURFACE_STATUS` | intact — `client-portfolio` **100 % vert** |
| `CANDIDATE_CURRENT_SURFACE_STATUS` | intact |
| `DASHBOARD_CANDIDATE_SOT_STATUS` | inchangé depuis I.1 — lit `CandidateCompany`, jamais `CompanyProfile` |
| `TENDER_CLIENT_CANDIDATE_SEMANTICS` | inchangée — aucune migration ne touche `Tender` |
| `HISTORICAL_ARTEFACT_STATUS` | inchangé — mémoire technique, DC1/DC2/DC4, checklists : **135/135 fichiers verts** |
| `TENANT_ISOLATION_STATUS` | préservée — prédicats `organization_id`, FK composites, aucun rattachement inter-organisation |
| `RBAC_STATUS` | préservé — les gardes restent placées **après** la vérification d'accès (règle I.1) |
| `BANKING_SECURITY_STATUS` | préservé et renforcé |
| `SOURCE_CLIENT_ACCOUNT_ID_STATUS` | `KEEP_PERMANENTLY` — provenance uniquement |
| `SOURCE_CLIENT_ACCOUNT_RUNTIME_FALLBACK_COUNT` | **0** |
| `DEFERRED_G_03_STATUS` | `DEFER_TO_ADMIN_FORMS_HARDENING` — inchangé |

Les quatre occurrences de `sourceClientAccountId` hors migration sont des **commentaires documentant
l'absence** de repli ; le champ n'est exposé dans aucune réponse HTTP.

---

## 10. Gates

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

`PRISMA_CHANGES` = **aucun**. `MIGRATIONS` = **aucune nouvelle** (§31 : préférer l'absence de
changement de schéma — ici pleinement atteinte).

---

## 10bis. Résultats de tests

| Suite | Résultat |
| --- | --- |
| `TARGETED_TEST_RESULTS` — `company-profile` + `candidate-company` + `client-portfolio` + `dashboard` | **42 / 43 fichiers** (seul échec : les 2 `P2-DASHBOARD-SQL-CAPTURE` préexistants) |
| `MIGRATION_TEST_RESULTS` — backfill satellite (dont la nouvelle preuve d'éligibilité des représentants) | **23 / 23** |
| `RUNTIME_TEST_RESULTS` — isolation I.2 (HTTP + PostgreSQL réels) | **21 / 21** |
| Specs I.1 + Legacy + complétude candidate + migration | **75 / 75** |
| §23/§24 — `tenders` + `administrative-dossier` + `technical-memo` | **135 / 135 fichiers** |
| `BROWSER_TEST_RESULTS` — séparation client / candidate | **3 / 3** |

Les 21 preuves d'exécution couvrent : les 7 familles en lecture (ligne candidate-owned absente,
ligne historique présente), le profil agrégé, la persistance du contact CRM côté client, les 7
familles en écriture, la sémantique d'archivage avec sa contre-preuve, le rattachement documentaire,
et les trois cas de la route documents-de-référence (client tiers → 404, candidate-owned → 404,
historique → 200).

---

## 11. Décision explicite : navigation candidate

`CANDIDATE_NAVIGATION_STATUS = GENERIC_LINK_ONLY`. Le lien vers la surface de gestion candidate,
posé en I.1, est conservé ; **aucun lien profond dérivé de `sourceClientAccountId` n'a été ajouté**.

La §20 autorise un tel lien « si nécessaire », mais la §29 demande que ce champ reste une provenance
de migration et ne soit jamais exposé comme identité métier. Construire une navigation à partir de
lui exposerait précisément la relation de provenance comme un lien métier. Le lien générique
remplissant déjà l'objectif de la §20, je n'ai pas créé cette dépendance — et je le signale plutôt
que de trancher silencieusement. Consigné au registre P2 pour arbitrage produit en I.3.

---

## 12. `P2_REGISTER`

| Réf | Statut |
| --- | --- |
| `P2-SWITCH-LATENCY` | reporté, non affecté |
| `P2-CREATE-LATENCY` | reporté, non affecté |
| `P2-MULTI-ORG-UI` | reporté, non affecté |
| `P2-TENDER-1024-OVERFLOW` | reporté, non affecté |
| `P2-UPLOAD-ASSOCIATION-ATOMICITY` | reporté, non affecté |
| `P2-DASHBOARD-SQL-CAPTURE` | reporté — 2 tests, préexistants |
| `P2-DASHBOARD-SEMANTIC-SOT` | **CLOS** par I.1 |
| `P2-CANDIDATE-FETCH-ERROR` | **CLOS** |
| `P2-CLIENT-SATELLITE-READ-SEMANTIC` | **CLOS par I.2** — les 6 familles sont bornées |
| `P2-AUTH-THROTTLE-E2E-BUCKET` | reporté — défaut de harnais, throttle inchangé |
| `P2-OUTBOX-HARNESS-SCOPED-PUBLISH` | reporté — préexistant, hors périmètre |
| `P2-COMPLIANCE-PROBE-MISSING-MODULE` | reporté — préexistant, hors périmètre |
| `P2-CANDIDATE-DEEP-LINK` | **NOUVEAU** — lien profond client → candidate non implémenté (§11), arbitrage I.3 |
| `P2-REGISTER-NOISE` | **NOUVEAU** — le registre inscrit tout client sans candidat (191 entrées) y compris ceux sans aucune ligne Legacy (56 lignes réellement concernées). Exact mais bruyant. |

---

## 13. Constats

`P0_FINDINGS` = **0** · `P1_FINDINGS` = **0** (l'IDOR du §6 a été trouvé **et corrigé** dans ce même
checkpoint, avec preuve avant/après) · `P2_FINDINGS` = 2 nouveaux (§12) · `P3_FINDINGS` = 0.
