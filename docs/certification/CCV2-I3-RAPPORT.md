# CCV2-I.3 — Séparation documentaire Client CRM / Entreprise candidate

**Branche** : `v2.1-post-decom-tnr3-certification` · **HEAD** : `074551d` · travaux non commités
(contrainte « no commit / no push » maintenue).

---

## 1. Cibles

| Champ | Valeur |
| --- | --- |
| `CLIENT_DOCUMENT_TARGET` | `CRM_COMMERCIAL_ONLY` |
| `CANDIDATE_DOCUMENT_TARGET` | `BIDDER_EVIDENCE_ONLY` |
| `CLIENT_DOCUMENT_CATEGORY_STATUS` | 6 catégories commerciales à l'écriture ; les 5 catégories historiques restent **lisibles** et libellées comme telles |
| `CANDIDATE_DOCUMENT_CATEGORY_STATUS` | inchangé — catalogue CCV2-D préservé, y compris `BANK_DETAILS` |
| `DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_STATUS` | **`KEEP_COMMERCIAL_CERTIFIED`** |

`Document` / `DocumentVersion` restent le moteur technique partagé : aucun stockage binaire n'est
dupliqué pour séparer des sémantiques métier.

---

## 2. `DOCUMENT_ASSOCIATION_CREATION_MATRIX`

| Association | Chemins de création | Garde |
| --- | --- | --- |
| `DocumentClientAccountAssociation` | **1** — `AttachDocumentToClientAccountUseCase` | accès client, puis catégorie commerciale (422 sinon) |
| `DocumentCandidateCompanyAssociation` | **2** — `AttachCandidateDocumentUseCase` + backfill de migration CCV2-E.1 | permissions candidate ; le backfill est hors ligne et déterministe |

Aucun autre module, tâche de fond ou commande imbriquée ne crée d'association : audit exhaustif sur
l'ensemble du code hors specs.

| Métrique | Valeur |
| --- | ---: |
| `CLIENT_UPLOAD_AUTO_CANDIDATE_ASSOCIATION_COUNT` | **0** |
| `CANDIDATE_UPLOAD_AUTO_CLIENT_ASSOCIATION_COUNT` | **0** |
| `SOURCE_CLIENT_ACCOUNT_DOCUMENT_RUNTIME_INFERENCE_COUNT` | **0** |

Prouvé dans la configuration la plus tentante : une organisation ne comptant **qu'une seule**
entreprise candidate. L'inférence « évidente » reste interdite.

---

## 3. Deux défauts de sécurité trouvés et corrigés

### 3.1 Fuite du listing documentaire générique (§15)

`GET /documents` n'appliquait **aucun** bornage métier. `GetDocument`, `ListDocumentVersions` et
`DownloadDocumentVersion` étaient bornés depuis CCV2-D/F.1 — mais pas la liste. Un justificatif
bancaire candidate y figurait donc avec son titre et ses métadonnées de version pour **n'importe
quel rôle**, `READ_ONLY` compris : le détail était fermé, la vitrine ne l'était pas.

Reproduit avant correction. Corrigé par une variante **en lot** du bornage
(`DocumentAccessNarrowingPolicy.filterReadable`), en **une seule requête** par page plutôt que
jusqu'à 100 appels unitaires — et sans requête du tout pour un acteur détenant déjà la permission
bancaire. La pagination n'est délibérément pas recomplétée après filtrage : recharger jusqu'à
remplir la page révélerait, par la position du curseur, l'existence des documents masqués.

Point d'extension **optionnel**, comme le reste du contrat : sans bridge enregistré, le
comportement de liste est strictement inchangé.

### 3.2 Ordre des gardes sur le rattachement client (§27)

`assertClientCommercialDocumentCategory` s'exécutait **avant** la vérification d'accès. Un acteur
sans aucun droit sur le client recevait donc `422` : par la différence entre `422` et `404`, il
apprenait que sa catégorie **aurait été acceptée**, et le produit lui répondait sur le fond alors
qu'il devait l'ignorer.

Corrigé — l'autorisation passe désormais en premier, même règle qu'en I.1. **Contre-preuve** : garde
remise temporairement à sa place initiale → le test repasse au rouge (`422` au lieu de `404`), puis
correctif rétabli et suite reverte.

---

## 4. `CLIENT_DOCUMENT_IDOR_MATRIX`

| Surface | Acteur hostile | Attendu | Obtenu |
| --- | --- | --- | --- |
| `GET /clients/B/documents` | affecté au seul client A | 403/404 | **404** |
| `GET /clients/A/documents` | affecté au seul client A | 200 | **200** (contre-preuve) |
| liste du client A | — | ne contient pas les documents du client B | **conforme** |
| `POST /clients/B/documents` | affecté au seul client A | refus d'accès, jamais 422 | **404** |
| `GET /clients/:id/references/:refId/documents` | — | corrigé en I.2 | **PASS** (re-vérifié) |

**Note de méthode, importante pour la lecture de cette matrice** : les sondes hostiles sont menées
par un acteur `CONTRIBUTOR` affecté au seul client A — jamais par l'`OWNER`. Le modèle d'accès est à
deux paliers : un rôle d'organisation détenant déjà la permission traverse **légitimement** les
affectations. Une sonde menée avec l'OWNER ne prouverait rien sur le cloisonnement inter-clients ;
elle mesurerait un comportement voulu. Mes deux premières sondes commettaient précisément cette
erreur et ont été refaites.

`REFERENCE_DOCUMENT_SECURITY_STATUS` = **PASS**.

---

## 5. Isolation candidate et bancaire

| Champ | Valeur |
| --- | --- |
| `CANDIDATE_DOCUMENT_ISOLATION_STATUS` | PASS |
| `TENANT_DOCUMENT_ISOLATION_STATUS` | PASS — 404 anti-énumération inter-organisations, rattachement croisé refusé |
| `CANDIDATE_BANKING_DOCUMENT_CLIENT_LEAK_COUNT` | **0** |
| `BANKING_VERSION_HISTORY_REGRESSION` | **PASS** |

Le RIB candidat est refusé sur les quatre surfaces génériques — liste, détail, historique de
versions, téléchargement — pour un acteur sans `candidate:read_banking`, et reste accessible à qui
la détient. Cette dernière contre-preuve est indispensable : sans elle, un blocage général
satisferait aussi les quatre premières.

---

## 6. Document partagé et sémantique de suppression

| Champ | Valeur |
| --- | --- |
| `HISTORICAL_DUAL_ASSOCIATION_STATUS` | préservé — les deux associations coexistent, chacune lisible par sa route |
| `SHARED_DOCUMENT_DELETE_SAFETY` | **PASS** |
| `CLIENT_DOCUMENT_VERSIONING_STATUS` | `NOT_SUPPORTED` — aucune route de versionnement ni de détachement côté client |

La sécurité du §26 est **structurelle** et non conventionnelle : la surface client n'expose ni
`DELETE` ni détachement d'association (vérifié, pas supposé — la tentative répond 404). Il n'existe
donc aucun chemin client capable de détruire une pièce de candidature. Conformément au §17, aucune
fonctionnalité de versionnement CRM n'a été inventée pour l'occasion.

---

## 7. `P2_UPLOAD_ASSOCIATION_ATOMICITY_STATUS = MITIGATED`

Trois constats distincts, plutôt qu'un verdict global :

- **Moteur documentaire** : `put` sur le stockage objet, puis transaction base, avec **compensation**
  (suppression du binaire) si la transaction échoue. C'est le motif le plus fort disponible — le §23
  interdit justement de prétendre qu'une opération de stockage objet serait transactionnelle.
- **Surface client** : rattachement **seul**, aucun dépôt combiné. Le risque d'atomicité n'y existe
  pas.
- **Surface candidate** (web) : dépôt puis rattachement, deux appels dans un même geste. En cas
  d'échec du second, l'interface **dit explicitement** que le fichier est déposé dans la bibliothèque
  mais non rattaché. Un document sans association n'est pas un orphelin : c'est un document
  d'organisation légitime, récupérable.

`MITIGATED` et non `CLOSED` : la séquence à deux appels reste par conception non atomique. Aucune
perte de donnée ni état silencieux n'en découle.

---

## 8. `DOCUMENT_ORPHAN_MATRIX`

Base **locale, non production**.

| Contrôle | Résultat |
| --- | ---: |
| Versions sans document parent | **0** |
| Associations client sans document | **0** |
| Associations candidate sans document | **0** |
| Documents sans version courante | **1** |
| Documents sans aucune association | 116 / 126 |

L'intégrité référentielle est intacte. Les 116 documents sans association **ne sont pas des
orphelins** : ce sont des documents d'organisation légitimes (DCE, bibliothèque générale) — seuls 10
relèvent d'un rattachement candidate.

Le document sans version (`6e0ab28f…`, « Attestation assurance decennale », `USER_UPLOAD`,
2026-08-08) est le seul état incomplet. Il ne peut pas être produit par le chemin actuel, qui crée
document et version dans une même transaction compensée. Consigné au registre P2, **non supprimé**
(§24/§30).

---

## 9. Interface

| Champ | Valeur |
| --- | --- |
| `CLIENT_DOCUMENT_UI_STATUS` | **corrigé** — catégories commerciales |
| `CANDIDATE_DOCUMENT_UI_STATUS` | onglet renommé « Documents de candidature » |
| `COMPANY_PROFILE_DOCUMENT_UI_STATUS` | rubrique CRM active ; les 7 rubriques bidder restent en lecture seule (I.1/I.2) |
| `CANDIDATE_NAVIGATION_STATUS` | `GENERIC_LINK_ONLY` — maintenu |

**Défaut d'interface trouvé** : la rubrique documents du client ne proposait que le catalogue de
CANDIDATURE (`KBIS`, `TAX_CERTIFICATE`, `SOCIAL_CERTIFICATE`, `ARTICLES_OF_ASSOCIATION`, `OTHER`) —
dont l'API refuse **chaque** valeur en 422 depuis I.1. **Toutes** les options offertes étaient donc
vouées à l'échec, sans que l'utilisateur puisse comprendre pourquoi. C'est exactement la classe de
défaut que I.1 avait écartée pour les formulaires, et qui avait été manquée pour les documents.
Corrigé, avec les libellés historiques conservés en lecture pour ne jamais afficher un code brut.

Sur `CANDIDATE_NAVIGATION_STATUS` : la séparation documentaire ne dégrade pas l'ergonomie — le
message de la rubrique client oriente désormais explicitement vers la fiche candidate. Le lien
profond dérivé de `sourceClientAccountId` reste écarté (§29/§30) : il devrait venir d'une relation
métier explicite, jamais d'une provenance de migration.

---

## 10. Gates et tests

| Gate | Résultat |
| --- | --- |
| `PRISMA_VALIDATE` | ✅ |
| `PRISMA_MIGRATE_STATUS` | ✅ 115 migrations, base à jour |
| `API_TYPECHECK` | ✅ 0 |
| `API_LINT` | ✅ 0 |
| `API_BUILD` | ✅ |
| `WEB_TYPECHECK` | ✅ 0 |
| `WEB_LINT` | ✅ 0 erreur (1 avertissement préexistant) |
| `WEB_BUILD` | ✅ |

| Suite | Résultat |
| --- | --- |
| `RUNTIME_TEST_RESULTS` — séparation documentaire I.3 | **14 / 14** |
| `TARGETED_TEST_RESULTS` — `company-profile` + `candidate-company` + `documents` + `client-portfolio` | **60 / 61 fichiers, 0 échec** (1 ignoré) |
| `BROWSER_TEST_RESULTS` — séparation client / candidate (dont la preuve I.3) | **4 / 4** |
| Chaîne I.1 + I.2 + I.3 rejouée ensemble | **48 / 48** |
| `CLIENT_COMMERCIAL_REGRESSION` | PASS |
| `CANDIDATE_DOCUMENT_REGRESSION` | PASS |
| `HISTORICAL_ARTEFACT_STATUS` | inchangé — aucune opération ne réécrit un artefact de Tender |

`PRISMA_CHANGES` = **aucun** · `MIGRATIONS` = **aucune**.
`DEFERRED_G_03_STATUS` = `DEFER_TO_ADMIN_FORMS_HARDENING`, inchangé.

---

## 11. `P2_REGISTER`

| Réf | Statut |
| --- | --- |
| `P2-SWITCH-LATENCY` · `P2-CREATE-LATENCY` · `P2-MULTI-ORG-UI` · `P2-TENDER-1024-OVERFLOW` | reportés, non affectés |
| `P2-DASHBOARD-SQL-CAPTURE` | reporté — préexistant |
| `P2-DASHBOARD-SEMANTIC-SOT` · `P2-CANDIDATE-FETCH-ERROR` · `P2-CLIENT-SATELLITE-READ-SEMANTIC` | **CLOS** |
| `P2-UPLOAD-ASSOCIATION-ATOMICITY` | **MITIGATED** (§7) |
| `P2-CANDIDATE-DEEP-LINK` | reporté — décision de conception assumée (§9) |
| `P2-REGISTER-NOISE` | reporté |
| `P2-AUTH-THROTTLE-E2E-BUCKET` · `P2-OUTBOX-HARNESS-SCOPED-PUBLISH` · `P2-COMPLIANCE-PROBE-MISSING-MODULE` | reportés — préexistants |
| `P2-VERSIONLESS-DOCUMENT` | **NOUVEAU** — 1 document sans version courante (§8), non reproductible par le chemin actuel, conservé |

---

## 12. Constats

`P0_FINDINGS` = **0** · `P1_FINDINGS` = **0** — les deux défauts du §3 ont été trouvés **et**
corrigés dans ce checkpoint, chacun reproduit avant correction · `P2_FINDINGS` = 1 nouveau ·
`P3_FINDINGS` = 0.
