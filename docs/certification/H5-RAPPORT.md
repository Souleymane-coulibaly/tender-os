# H.5 — Document sans version : qualité de donnée et stratégie de réparation

**Branche** : `v2.1-post-decom-tnr3-certification` · **HEAD** : `074551d` · travaux non commités
(contrainte « no commit / no push » maintenue).

---

## 1. `DOCUMENT_CREATION_PATH_INVENTORY`

Recherche exhaustive de toute écriture sur la table `documents`.

| Chemin | Classification | Peut créer ? |
| --- | --- | --- |
| `CreateDocumentWithFirstVersionUseCase` → `DocumentRepository.createWithInitialVersion` | **CURRENT_PRODUCT** | **oui — seul chemin** |
| `DocumentRepository.save` (8 appelants : archive, delete, restore, métadonnées, dossier administratif, pièces demandées) | CURRENT_PRODUCT | **non** — implémenté par `document.update`, jamais un upsert |
| `addVersionAndPromote` | CURRENT_PRODUCT | non — ajoute une version à un Document existant |
| `prisma.document.create` direct | **TEST_ONLY** — 3 occurrences, toutes dans des specs | oui, hors produit |
| Module DCE | CURRENT_PRODUCT | non — table `dce_documents` distincte |
| Migrations / backfills | MIGRATION | non — ne créent aucun `Document` |

`CURRENT_VERSIONLESS_DOCUMENT_CREATION_PATH_COUNT` = **0**.

`DOCUMENT_FIRST_VERSION_TRANSACTION_STATUS` = **`ATOMIC`** — `createWithInitialVersion` exécute
création du Document, création de la première version et promotion du pointeur dans **une seule**
`$transaction`.

---

## 2. `FAILURE_INJECTION_RESULTS`

| Panne injectée | État observé |
| --- | --- |
| Stockage objet, avant écriture | aucune ligne engagée |
| Journal d'audit, **après** validation de la transaction | Document + version engagés et **cohérents** — jamais de Document sans version |
| Chemin nominal | Document et première version naissent ensemble |

Le code actuel **ne peut pas** produire un `Document` sans `DocumentVersion`. Prouvé par injection sur
le chemin réel, jamais déduit d'une lecture de code.

---

## 3. Un défaut trouvé en chemin : la compensation détruisait des fichiers déjà engagés

L'injection a révélé autre chose que ce que le checkpoint cherchait.

`storageProvider.delete(storageKey)` s'exécutait dans le `catch` pour **toute** erreur — y compris
survenue **après** la validation de la transaction. Mesuré :

> `documentSurvit: true`, `storageDeleteAppele: 1`

Autrement dit : une panne du journal d'audit ou de l'Outbox laissait le `Document` et sa
`DocumentVersion` durablement en base **et supprimait le fichier**. Le résultat était pire que
l'anomalie recherchée — un document d'apparence parfaitement valide, dont le contenu n'existait plus,
sans que rien en base ne le signale.

**Correctif** : la compensation est bornée à l'avant-commit, ce qui est exactement son intention
d'origine (« si la transaction échoue après un upload réussi, le fichier physique est supprimé »).
Un drapeau `persisted` est posé dès le retour de `createWithInitialVersion`.

La preuve associée assère désormais `storageDeleteCalls == []` : elle échouait avant le correctif.

C'est la « nouvelle preuve d'une perte de donnée réelle » que le §18 désigne comme seul motif
légitime de toucher à ce périmètre. `P2-UPLOAD-ASSOCIATION-ATOMICITY` reste par ailleurs
`MITIGATED_ACCEPTABLE_FOR_2_1` : l'architecture à deux appels n'a pas été rouverte.

---

## 4. Audit de base (§7)

| Métrique | Valeur |
| --- | ---: |
| `TOTAL_DOCUMENTS` | 127 |
| `TOTAL_DOCUMENT_VERSIONS` | 129 |
| `VERSIONLESS_DOCUMENT_COUNT` | **1** |
| `ORPHAN_DOCUMENT_VERSION_COUNT` | **0** |
| `BROKEN_CLIENT_ASSOCIATION_COUNT` | **0** |
| `BROKEN_CANDIDATE_ASSOCIATION_COUNT` | **0** |
| `BROKEN_OTHER_ASSOCIATION_COUNT` (documents de référence) | **0** |
| Pointeurs `current_version_id` dans le vide | **0** |

---

## 5. `VERSIONLESS_DOCUMENT_FORENSICS`

| Champ | Valeur |
| --- | --- |
| id | `6e0ab28f-c3f3-436b-8d27-32dc93d0bdf5` |
| organisation | `ea41ba2c…` — **« Checklist Org A HTTP »**, slug `checklist-org-a-http-…` |
| titre | « Attestation assurance decennale » |
| statut / origine / domaine | `ACTIVE` / `USER_UPLOAD` / `TENDER` |
| `current_version_id` / `current_version_number` | `NULL` / `0` |
| créé / modifié | 2026-08-08 01:19:42.355 — identiques |
| associations (client, candidate, tender, référence, package, base de connaissances) | **0 partout** |
| membres de l'organisation / auteur | **0** / **supprimé** |

### `VERSIONLESS_DOCUMENT_ORIGIN_CLASSIFICATION` = **`C. TEST/FIXTURE RESIDUE`**

Quatre éléments concordants, aucun supposé :

1. l'organisation porteuse est une **fixture de test** (`checklist-org-a-http-…`), créée
   **2 secondes** avant le document — 01:19:40.444 contre 01:19:42.355 ;
2. la spec correspondante contient précisément des `prisma.document.create` **directs**, qui
   court-circuitent le dépôt atomique et produisent exactement cette signature
   (`current_version_id NULL`, `current_version_number 0`) ;
3. la transaction atomique existe dans le dépôt depuis le **2026-07-27**, soit **avant** le
   2026-08-08 : le chemin produit ne pouvait pas produire cet état à cette date ;
4. le teardown de cette spec **nettoie** bien documents et organisations — il ne s'est simplement
   pas exécuté jusqu'au bout ce jour-là. Quatre organisations `checklist-org-%` subsistent, et le
   compte de Documents sans version est resté à **1** sur toutes mes exécutions d'aujourd'hui : le
   nettoyage fonctionne en régime normal.

| Champ | Valeur |
| --- | --- |
| `VERSIONLESS_DOCUMENT_ASSOCIATION_STATUS` | **non associé** — aucune association d'aucun type |
| `VERSIONLESS_DOCUMENT_PRODUCT_VISIBILITY` | **inatteignable** — organisation sans aucun membre, auteur supprimé : aucun acteur ne peut établir de contexte sur cette organisation |
| `VERSIONLESS_DOCUMENT_READ_BEHAVIOR` | **sûr** — le listing rend `toDocumentSummary(document, undefined)` sans planter ; un téléchargement échouerait faute de version. Vérifié dans le code, pas supposé |
| `DOCUMENT_SECURITY_STATUS` | **intact** — la ligne ne contourne rien : elle vit dans une organisation à laquelle personne n'appartient |
| `STORAGE_INTEGRITY_STATUS` | aucun objet de stockage n'est référencé (pas de version, donc pas de `storageKey`) ; **aucun objet supprimé** |

---

## 6. `REPAIR_POLICY` = **`NO_REPAIR_REQUIRED` + report**

| Champ | Valeur |
| --- | ---: |
| `DATA_DELETED` | **0** |
| `FAKE_VERSION_CREATED` | **0** |

La ligne est **conservée**. La supprimer aurait remis un compteur à zéro en effaçant la seule pièce à
conviction, et fabriquer une première version aurait produit une donnée inventée — les deux sont
explicitement interdits (§1/§14), et aucun des deux n'aurait rien corrigé : le produit ne peut plus
créer cet état.

Le vrai correctif de ce checkpoint est ailleurs : la compensation de stockage (§3).

---

## 7. `PREPROD_DOCUMENT_INTEGRITY_CHECK` / `PRODUCTION_DOCUMENT_INTEGRITY_CHECK`

Sonde **non destructive**, en lecture seule, intégrée à la suite et rejouable telle quelle avant et
après une migration :

```sql
-- Documents sans aucune version
SELECT count(*) FROM documents d
 WHERE NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.document_id = d.id);
-- Versions orphelines
SELECT count(*) FROM document_versions v
 WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = v.document_id);
-- Associations client / candidate rompues
SELECT count(*) FROM document_client_account_associations a
 WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = a.document_id);
SELECT count(*) FROM document_candidate_company_associations b
 WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = b.document_id);
-- Pointeurs de version courante dans le vide
SELECT count(*) FROM documents d
 WHERE d.current_version_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.id = d.current_version_id);
```

Les quatre dernières sont assertées à **0** dans la suite : ce sont des propriétés **référentielles**,
qu'aucune donnée historique ne peut légitimement violer. Le compte de Documents sans version, lui,
n'est **pas** asserté globalement — le faire forcerait à supprimer le résidu historique pour verdir
un compteur. Il est asserté à 0 **sur l'organisation créée par le test**, ce qui mesure le produit
sans exiger l'effacement du passé.

Aucun worker permanent n'a été ajouté pour une seule ligne historique (§19).

---

## 8. Régressions et gates

| Suite | Résultat |
| --- | --- |
| `DATA_INTEGRITY_TEST_RESULTS` + `INTEGRATION_TEST_RESULTS` — spec H.5 | **5 / 5** |
| `UNIT_TEST_RESULTS` — module `documents` + séparation documentaire I.3 | **133 / 133** (4 ignorés, 23 fichiers) |

Régression bornée au code touché (§24) : seul `create-document-with-first-version.use-case.ts` a été
modifié côté produit. Aucun code d'autorisation, de bascule de candidat ni d'interface n'ayant été
touché, un rejeu large de H.1/H.2/H.3 n'apporterait aucune information — les invariants concernés ne
traversent pas ce fichier.

| Gate | Résultat |
| --- | --- |
| `PRISMA_VALIDATE` · `PRISMA_MIGRATE_STATUS` | ✅ · ✅ 115 migrations |
| `API_TYPECHECK` · `API_LINT` · `API_BUILD` | ✅ 0 · ✅ 0 · ✅ |
| `WEB_TYPECHECK` · `WEB_LINT` · `WEB_BUILD` | ✅ 0 · ✅ 0 · ✅ |

`PRISMA_CHANGES` = **NONE** · `MIGRATIONS` = **NONE** — aucun déclencheur ni contrainte exotique n'a
été inventé pour imposer « un parent doit avoir au moins un enfant » (§23).

`TEST_OWNED_PROCESS_LEAK_COUNT` = **0**.

---

## 9. Registres

| Réf | Statut |
| --- | --- |
| `P2-VERSIONLESS-DOCUMENT` | **`CLOSED_AS_LEGACY_DATA_QUALITY`** — origine établie (résidu de fixture), ligne conservée et documentée, produit prouvé incapable de reproduire l'état |
| `P2-UPLOAD-ASSOCIATION-ATOMICITY` | `MITIGATED_ACCEPTABLE_FOR_2_1` — inchangé ; la correction du §3 porte sur la compensation, pas sur l'architecture à deux appels |
| `P2-DEV-SERVER-PROCESS-TREE-ORPHANS` | **TOOLING**, reporté |
| `P2-I-FINAL-AUTHORIZATION-ORDER` · `P2-CREATE-LATENCY` · `P2-SWITCH-LATENCY` · `P2-TENDER-1024-OVERFLOW` · `P2-I-FINAL-HTTP-CERTIFICATION` · `P2-DASHBOARD-SQL-CAPTURE` · `P2-AUTH-THROTTLE-E2E-BUCKET` · `P2-OUTBOX-HARNESS-SCOPED-PUBLISH` | **CLOSED**, inchangés |
| `P2-MULTI-ORG-UI` · `P2-CANDIDATE-NAVIGATION` | `POST_2_1` |
| `DEFERRED-G-03` | → **H.6** |
| `P2-TEST-TEARDOWN-INTERRUPTION` | **NOUVEAU** — un teardown de spec interrompu laisse organisation et documents ; mécanisme à l'origine du résidu. Non corrigé ici : le nettoyage fonctionne en régime normal (compte stable à 1 sur toutes les exécutions du jour) |

`P3_REGISTER` — `P3-STALE-SWITCH-NO-VERSION` (H.2), inchangé.

---

`P0_FINDINGS` = **0** · `P1_FINDINGS` = **0** — la perte de fichier du §3 a été trouvée **et**
corrigée dans ce checkpoint, avec mesure avant/après · `P2_FINDINGS` = 1 nouveau · `P3_FINDINGS` = 0.

| Champ | Valeur |
| --- | --- |
| `FILES_CREATED` | 1 — `h5-document-integrity.integration.spec.ts` |
| `FILES_MODIFIED` | 1 — `create-document-with-first-version.use-case.ts` |
| `FILES_DELETED` | 0 |
