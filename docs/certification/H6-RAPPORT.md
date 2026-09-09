# H.6 — Formulaires administratifs : durcissement sémantique de l'identité juridique

**Branche** : `v2.1-post-decom-tnr3-certification` · **HEAD** : `074551d` · travaux non commités
(contrainte « no commit / no push » maintenue).

Constat traité : `DEFERRED-G-03`.

---

## 1. `CANDIDATE_IDENTITY_MODEL`

| Champ | Sémantique | Nullable |
| --- | --- | --- |
| `name` | nom d'usage interne, obligatoire à la création | non |
| `legalName` | **dénomination sociale** — identité juridique de la personne morale | oui |
| `tradeName` | **nom commercial**, ajouté en CCV2-F.1, éditable depuis F.2 | oui |
| `siren` · `vatNumber` · `legalForm` | identifiants de registre | oui |
| `CandidateEstablishment.siret` / adresse | établissement **PRINCIPAL** uniquement | établissement optionnel |

Libellés de l'interface, vérifiés (§11) : `legalName` → « Raison sociale », `tradeName` → « Nom
commercial ». Sans ambiguïté, conformes à la terminologie française — **aucune correction
nécessaire**, et donc aucune touchée.

---

## 2. `RESOLVE_CANDIDATE_IDENTITY_STATUS` et `DISPLAY_NAME_SEMANTIC`

`displayName = legalName ?? name`.

`DISPLAY_NAME_SEMANTIC` = **`GENERIC_DISPLAY_LABEL`**, désormais **explicite**. Il ne l'était pas :
la documentation du résolveur affirmait encore que « `CandidateCompany` ne porte pas de nom
commercial distinct ». C'était vrai en A1 ; ce ne l'est plus depuis F.1. Ce commentaire périmé était
la racine documentaire de `DEFERRED-G-03` — il faisait passer pour une absence de concept ce qui
était devenu une omission.

Corrigé : le résolveur **expose désormais `tradeName`**, et les trois notions sont nommées
séparément — libellé d'affichage, dénomination sociale, nom commercial.

---

## 3. `OFFICIAL_FORM_FIELD_MATRIX`

La question décisive n'était pas « quel nom mettre » mais « que demande le formulaire officiel ».
La réponse est dans le dépôt lui-même, dans la documentation des gabarits :

> `prepare-dc2-template.ts` — `P37  nom commercial / dénomination sociale`

| Formulaire | Champ | Sémantique officielle | Source AVANT | Source APRÈS | Statut |
| --- | --- | --- | --- | --- | --- |
| DC1 (P46) | `candidate.tradeName` | **`LEGAL_ENTITY_NAME` + `TRADE_NAME`** (champ combiné) | `displayName` seul | `legalName (tradeName)` | **corrigé** |
| DC2 (P37) | `candidate.tradeName` | idem, documenté mot pour mot | `displayName` seul | `legalName (tradeName)` | **corrigé** |
| DC4 (P50) | `titulaire.tradeName` | idem, rubrique D | `displayName` seul | `legalName (tradeName)` | **corrigé** |
| DC4 (P72) | `subcontractor.tradeName` | identité du **sous-traitant** | répertoire sous-traitant | inchangé | conforme |
| DC2 | membres de groupement | identité **du membre** | `member.name` | inchangé | conforme |
| DC1/DC2/DC4 | `siret`, `address` | `SIRET` / `ADDRESS` | établissement PRINCIPAL du candidat | inchangé | conforme |
| DC2 | `legalForm` · `vatNumber` | `LEGAL_FORM` / `VAT` | `CandidateCompany` | inchangé | conforme |

### Le vrai contenu de DEFERRED-G-03

Le champ officiel est **combiné** : il réclame le nom commercial **et** la dénomination sociale. Les
mappeurs y plaçaient `displayName`, c'est-à-dire `legalName ?? name`.

La valeur n'était donc **pas fausse** — la moitié juridiquement indispensable était présente. Mais la
moitié commerciale était systématiquement omise, alors même que `tradeName` est renseignable par
l'utilisateur depuis F.2. Un champ éditable qui n'atteint jamais le document officiel est une
promesse non tenue, et `TRADENAME_OFFICIAL_CONSUMER_COUNT` valait **0** alors que le formulaire en
demandait un.

---

## 4. `OFFICIAL_LEGAL_NAME_POLICY` et `TRADENAME_POLICY`

Règle unique, partagée par les trois formulaires (`buildOfficialCompanyName`) :

| Cas | Valeur émise |
| --- | --- |
| dénomination sociale + nom commercial différent | `«dénomination sociale (nom commercial)»` |
| nom commercial absent, vide, ou identique | dénomination sociale **seule** — sortie identique à avant |
| dénomination sociale absente | repli délibéré sur `name` (§16), jamais sur le nom commercial |
| **rien** d'exploitable | **`undefined`** — champ signalé manquant, jamais rempli d'un nom trompeur |

**L'ordre n'est pas cosmétique** : la dénomination sociale vient toujours en premier. Placer le nom
commercial en tête aurait risqué qu'un lecteur — ou un acheteur public — le prenne pour l'identité
juridique du soumissionnaire. Le nom commercial reste une précision explicitement entre parenthèses.

`TRADENAME_POLICY` : le nom commercial n'est **jamais émis seul** et ne peut pas tenir lieu
d'identité juridique (§9). `TRADENAME_OFFICIAL_CONSUMER_COUNT` = **3** (DC1, DC2, DC4) — non pas
parce que la propriété existe, mais parce que ces champs la demandent explicitement.

---

## 5. Invariants d'isolement

| Métrique | Valeur |
| --- | ---: |
| `CURRENT_ADMIN_FORM_COMPANYPROFILE_FALLBACK_COUNT` | **0** |
| `SOURCE_CLIENT_ACCOUNT_ADMIN_FORM_FALLBACK_COUNT` | **0** |
| `CRM_CONTACT_ADMIN_FORM_USAGE_COUNT` | **0** |
| `ADMIN_FORM_CLIENTACCOUNT_BIDDER_IDENTITY_USAGE_COUNT` | **0** |

Vérifiés par recherche exhaustive dans le module `administrative-dossier`, **et** prouvés à
l'exécution par les sentinelles ci-dessous.

| Champ | Valeur |
| --- | --- |
| `ESTABLISHMENT_IDENTITY_STATUS` | **conforme** — établissement PRINCIPAL du candidat, jamais un établissement arbitraire ni une provenance client |
| `BANKING_IDENTITY_STATUS` | **hors périmètre** — aucun formulaire audité ne consomme de donnée bancaire ; aucune exposition élargie |
| `GROUPEMENT_IDENTITY_STATUS` · `SUBCONTRACTOR_IDENTITY_STATUS` | **isolés** — le membre de groupement garde `member.name`, le sous-traitant son propre répertoire. Aucun remplacement global par l'identité candidate |

---

## 6. `HOSTILE_SENTINEL_RESULTS`

Sentinelles **toutes différentes** — une valeur partagée rendrait indétectable la substitution même
que le test interdit.

| Sentinelle | Emplacement | Attendu au DC2 généré |
| --- | --- | --- |
| `CANDIDATE-LEGAL-SA` | `CandidateCompany.legalName` | **présent** |
| `CANDIDATE-TRADE` | `CandidateCompany.tradeName` | **présent** |
| `CANDIDATE-DISPLAY` | `CandidateCompany.name` | non requis (masqué par `legalName`) |
| `LEGACY-CLIENT-COMMERCIAL` | identité juridique du `ClientAccount` | **absent** |
| `CLIENT-COMMERCIAL-CONTACT` | contact CRM du client | **absent** |

Résultat, sur le **DOCX réellement généré** (§22) :

- champ officiel `candidate.tradeName` = **`CANDIDATE-LEGAL-SA (CANDIDATE-TRADE)`** ;
- le document contient `CANDIDATE-LEGAL-SA` **et** `CANDIDATE-TRADE` ;
- il ne contient **ni** `LEGACY-CLIENT-COMMERCIAL` **ni** `CLIENT-COMMERCIAL`.

`FINAL_FORM_MAPPING_PROOF` = **PASS** — la preuve porte sur la chaîne complète : `CandidateCompany`
→ résolveur → mapping de formulaire → sortie sérialisée. Une preuve par recherche dans le code aurait
été insuffisante (§22), et une preuve sur le seul contexte n'aurait pas couvert la liaison de champ.

| Champ | Valeur |
| --- | --- |
| `LEGALNAME_NULL_RESULT` | repli sur `name` — prouvé ; jamais le nom commercial |
| `TRADENAME_NULL_RESULT` | dénomination sociale seule ; **aucune génération n'échoue** faute de nom commercial |

---

## 7. Révisions et immuabilité

| Champ | Valeur |
| --- | --- |
| `CANDIDATE_SWITCH_NEW_OUTPUT_STATUS` | **PASS** — une nouvelle génération produit une nouvelle révision, avec l'identité du candidat courant |
| `HISTORICAL_ADMIN_FORM_IMMUTABILITY_STATUS` | **PASS** — la preuve de lignage existante (« générer deux fois ajoute la révision #2, l'instantané R1 reste gelé ») passe inchangée. **Aucune** réécriture en place d'un document déjà généré |

---

## 8. Une limite de la suite existante, que je signale

Les 285 tests du dossier administratif passaient **déjà** avant mon correctif. Ce n'est pas une
preuve de non-régression rassurante : leurs fixtures ne renseignent aucun `tradeName` distinct, donc
le changement y est **inerte**. Une suite qui ne peut pas distinguer les deux comportements ne peut
pas non plus certifier le bon.

C'est pourquoi la preuve sentinelle a été ajoutée : elle est le seul test du dépôt capable
d'échouer si l'on revenait à `displayName` seul.

---

## 9. Gates et tests

| Gate | Résultat |
| --- | --- |
| `PRISMA_VALIDATE` · `PRISMA_MIGRATE_STATUS` | ✅ · ✅ 115 migrations |
| `API_TYPECHECK` · `API_LINT` · `API_BUILD` | ✅ 0 · ✅ 0 · ✅ |
| `WEB_TYPECHECK` · `WEB_LINT` · `WEB_BUILD` | ✅ 0 · ✅ 0 · ✅ |

| Suite | Résultat |
| --- | --- |
| `UNIT_TEST_RESULTS` — sémantique du champ officiel | **5 / 5** |
| `GENERATED_FORM_TEST_RESULTS` — DC2 avec génération DOCX réelle | **7 / 7** |
| `INTEGRATION_TEST_RESULTS` — `administrative-dossier` + `candidate-company` + `technical-memo` | **583 / 583 tests, 94 / 94 fichiers** |

`PRISMA_CHANGES` = **NONE** · `MIGRATIONS` = **NONE** — la sémantique se résout entièrement dans le
mapping et le domaine, comme le §32 l'anticipait.

`TEST_OWNED_PROCESS_LEAK_COUNT` = **0**.

Sécurité (§24) : aucun champ d'identité n'a été rendu inscriptible, aucune API d'identité candidate
n'a été touchée. Les protections F.2/H.1 (`.strict()`, isolation de tenant,
`candidate:manage_identity`, refus au rôle lecteur) sont inchangées.

---

## 10. `DEFERRED_G_03_STATUS` = **`CLOSED_FIXED`**

Fermé avec correction produit : le champ officiel combiné reçoit désormais les deux moitiés qu'il
demande, la dénomination sociale d'abord.

### Registres

| Réf | Statut |
| --- | --- |
| `DEFERRED-G-03` | **CLOSED_FIXED** |
| `P2-I-FINAL-AUTHORIZATION-ORDER` · `P2-CREATE-LATENCY` · `P2-SWITCH-LATENCY` · `P2-TENDER-1024-OVERFLOW` · `P2-I-FINAL-HTTP-CERTIFICATION` · `P2-DASHBOARD-SQL-CAPTURE` · `P2-AUTH-THROTTLE-E2E-BUCKET` · `P2-OUTBOX-HARNESS-SCOPED-PUBLISH` · `P2-VERSIONLESS-DOCUMENT` | **CLOSED**, inchangés |
| `P2-UPLOAD-ASSOCIATION-ATOMICITY` | `MITIGATED_ACCEPTABLE` pour 2.1 |
| `P2-MULTI-ORG-UI` · `P2-CANDIDATE-NAVIGATION` | `POST_2_1` |
| `P2-DEV-SERVER-PROCESS-TREE-ORPHANS` · `P2-TEST-TEARDOWN-INTERRUPTION` | **TOOLING**, reportés |
| `P2-ADMIN-FORM-FIXTURES-INDISTINCT` | **NOUVEAU** — les fixtures DC ne portent pas de `tradeName` distinct ; hors la sentinelle H.6, la suite ne peut pas distinguer les deux comportements (§8) |

`P3_REGISTER` — `P3-STALE-SWITCH-NO-VERSION` (H.2), inchangé.

---

`P0_FINDINGS` = **0** · `P1_FINDINGS` = **0** — l'omission a été trouvée **et** corrigée dans ce
checkpoint · `P2_FINDINGS` = 1 nouveau · `P3_FINDINGS` = 0.

| Champ | Valeur |
| --- | --- |
| `FILES_CREATED` | 2 — `official-company-name.ts`, `h6-official-legal-identity.spec.ts` |
| `FILES_MODIFIED` | 5 — résolveur d'identité, 3 mappeurs DC, spec DC2 (sentinelle) |
| `FILES_DELETED` | 0 |
