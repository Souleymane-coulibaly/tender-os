# CCV2-I.1 — Séparation sémantique Client CRM / Entreprise candidate

**Branche** : `v2.1-post-decom-tnr3-certification` · **HEAD** : `074551d` · travaux non commités
(contrainte « no commit / no push » maintenue).

---

## 1. Cible et périmètre

| Champ | Valeur |
| --- | --- |
| `CLIENTACCOUNT_TARGET` | `CRM_COMMERCIAL_ONLY` |
| `NEW_BIDDER_DUAL_WRITE_SURFACE_COUNT` | **0** |
| `DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_STATUS` | `KEEP_COMMERCIAL` |
| Routes `/clients/:id/*` | **29, toutes conservées** (leur retrait relève de I.2, mission §24) |
| Lignes supprimées / déplacées / converties | **0** |

`ClientAccount` redevient ce qu'il désigne : la relation **commerciale**. `CandidateCompany` est
l'entité **juridique** qui candidate. Les deux peuvent correspondre à une même société réelle, mais
une donnée de candidature n'a désormais **qu'une seule source de vérité inscriptible**.

---

## 2. `LEGACY_BIDDER_WRITE_MATRIX`

17 méthodes d'écriture fermées, réparties sur 8 domaines. Le refus est levé **après** la vérification
d'accès et **avant** toute écriture.

| Domaine | Create | Update | Autre |
| --- | --- | --- | --- |
| Identité juridique | — | `RETIRED` (Upsert) | — |
| Représentant légal / signataire | `RETIRED` | `RETIRED` | contacts CRM : **inchangés** |
| Compte bancaire | `RETIRED` | `RETIRED` | Archive : **ouvert** (§4) |
| Assurance | `RETIRED` | `RETIRED` | — |
| Certification | `RETIRED` | `RETIRED` | — |
| Référence professionnelle | `RETIRED` | `RETIRED` | rattachement de document : `RETIRED` |
| Moyen humain | `RETIRED` | `RETIRED` | — |
| Moyen matériel | `RETIRED` | `RETIRED` | — |
| Document client | — | — | catégorie de candidature : **422** |

Codes : `409 CLIENT_BIDDER_WRITE_RETIRED` (domaine de candidature),
`422 CLIENT_COMMERCIAL_DOCUMENT_CATEGORY_INVALID` (catégorie documentaire).

**Ce qui reste pleinement ouvert côté client** : contacts CRM (`ADMINISTRATIVE_CONTACT`,
`COMMERCIAL_CONTACT`, `TECHNICAL_CONTACT`), documents commerciaux, et **toute la lecture**.

---

## 3. Placement du refus — l'autorisation d'abord

Le garde a d'abord été placé avant `assertClientAccess`, ce qui masquait le RBAC : un `VIEWER` sans
droit de gestion recevait `409` au lieu de son `403`. Corrigé — le garde est désormais **après** le
contrôle d'accès. L'autorisation conserve exactement sa sémantique antérieure, et le refus ne
s'applique qu'à ceux qui *seraient* autorisés. Aucune information sur l'état de la surface n'est
révélée à un acteur non habilité.

---

## 4. Deux décisions de périmètre explicites

**L'archivage bancaire reste ouvert.** L'invariant visé est qu'aucune donnée de candidature ne
*naisse* ni ne *change de valeur* sur la surface client. Archiver ne crée rien et n'altère aucune
valeur : cela retire une ligne historique de l'usage actif — un mouvement *dans* le sens du
décommissionnement. Le refuser aurait rendu les lignes Legacy définitivement inneutralisables depuis
leur seule surface de gestion, et aurait privé de preuve exécutable la régression P0 corrigée lors de
l'audit Codex.

**Le rattachement de documents à une référence professionnelle est fermé.** Lacune trouvée pendant la
revue de couverture : la référence n'étant plus créable, ne laisser ouvert que son enrichissement
documentaire aurait rouvert la seconde source de vérité par la porte de service.

---

## 5. Élévation de privilège trouvée et corrigée

`PrismaCompanyBankAccountRepository.list/findById/update` ne filtraient que sur `clientAccountId`.
Or une ligne migrée en CCV2-B porte **les deux** clés : `candidateCompanyId` (propriétaire métier) et
`clientAccountId` (lignage). La même ligne répondait donc aux deux routes, sous **deux systèmes de
permission différents** :

- route candidate : `candidate:read_banking` / `manage_banking`, rang **organisation** (CCV2-C.1) ;
- route client : `ClientPermission.ReadCompanyBanking`, rang **client**, obtenue par simple affectation.

C'est la permission la plus facile à obtenir qui déterminait l'accès au RIB : la garde forte de C.1
était contournable **sans jamais être violée**. Reproduit par un test avant correction, pas déduit du
code.

**Correction** : `candidateCompanyId: null` sur les trois accès de scope client. Aucune donnée n'est
perdue — ces lignes restent intégralement lisibles et modifiables par leur route légitime.

**Bornage assumé** : la restriction ne couvre **que le bancaire**, seul domaine où la mission fixe un
invariant de sécurité explicite. Les autres satellites conservent le chemin de lecture Legacy promis
par CCV2-B §9. La fuite sémantique équivalente sur ces satellites est consignée au registre P2.

---

## 6. `DASHBOARD_*` — fermeture de `P2-DASHBOARD-SEMANTIC-SOT`

Le tableau de bord affichait « Compléter l'entreprise candidate » en interrogeant en réalité la
complétude du profil des `ClientAccount` : la coche pouvait être verte sans qu'aucune entreprise
candidate n'existe, et inversement.

`SummarizeCandidateCompanyReadinessUseCase` rend désormais un **compte**
(`totalActive`, `completeIdentityCount`, `hasAtLeastOneComplete`), jamais une désignation : une
organisation peut porter plusieurs candidates, et élire « la » candidate ferait dépendre l'état
affiché d'un ordre de lecture. Critère de complétude = traduction fidèle des six champs de
`computeIdentityStatus`, lus à leur source candidate-native, jamais un durcissement inventé.
Lecture bornée à 25, même discipline que le reste du tableau de bord.

---

## 7. Migration

`20261017090000_ccv2_i1_client_commercial_document_categories` — strictement **additive** : la
contrainte CHECK est reconstruite avec les catégories CRM **et** les catégories Legacy. Aucune ligne
historique n'est invalidée. Appliquée par `prisma migrate deploy` (jamais `dev` / `reset` / `db push`).

`prisma validate` : OK · `migrate status` : 115 migrations, base à jour.

---

## 8. Preuves

### API — `ccv2i1-client-bidder-write-retired.integration.spec.ts` (HTTP + PostgreSQL réels)

13 preuves : les 7 domaines refusés en `409` sans écriture ; le représentant légal refusé alors que
le contact commercial reste créable ; la catégorie documentaire de candidature refusée en `422` avec
un message qui **oriente vers la bonne fiche** ; le RIB candidat absent de la route client ; le
rattachement documentaire d'une référence refusé, mais `404` sur un id inconnu (le refus ne révèle
pas l'état de la surface) ; l'identité et le signataire historiques toujours servis.

### API — spec Legacy `company-profile-http.integration.spec.ts` (11 preuves)

Contrats d'écriture **inversés**, propriétés de lecture et de sécurité **préservées à l'identique**
en amorçant les lignes historiques directement en base : masquage IBAN, archivage non destructif,
cloisonnement inter-clients (P0 Codex), `404` anti-énumération inter-org, complétude par catégorie,
`VIEWER` lecteur mais non gestionnaire.

### API — `summarize-candidate-company-readiness.use-case.spec.ts` (7 preuves)

Dont deux dédiées au multi-candidat : deux incomplètes créées **avant** la complète (un calcul par
rang tomberait sur une incomplète), et deux complètes comptées **toutes les deux** sans qu'aucune ne
soit élue.

### Navigateur — `client-candidate-separation-i1.spec.ts` — **3/3**

Le vocabulaire des onglets porte la frontière (« Contacts », « Documents commerciaux », « Identité
légale (historique) ») ; la rubrique historique reste lisible mais **chacun** de ses contrôles est
`disabled` (état natif, pas un masquage CSS) ; et la contre-preuve indispensable — l'identité reste
pleinement modifiable sur la fiche candidate. Sans cette dernière, les deux premières seraient tout
autant satisfaites par un produit où plus rien n'est modifiable nulle part.

### Résultats

| Suite | Résultat |
| --- | --- |
| **Non-régression API complète** | **4 825 / 4 836** — 3 échecs, tous établis préexistants (ci-dessous), 8 ignorés |
| `company-profile` (module complet) | **121 / 121** |
| Navigateur — preuves I.1 | **3 / 3** |
| Navigateur — specs voisines (candidate ×3, dashboard, isolation multi-tenant) | 35 passés ; les échecs résiduels de `dashboard.spec.ts` sont des expirations sur `login`, reproduites **vertes en isolation** (bucket d'authentification partagé, §9) |

Gates : API typecheck **0** · API lint **0** · API build **OK** (`dist/main.js`) · WEB typecheck **0** ·
WEB lint **0 erreur** · WEB build **OK**.

### Specs adaptées au nouveau contrat (et pourquoi elles n'ont pas été affaiblies)

Le premier passage complet a révélé 7 fichiers en échec. Quatre étaient imputables à ce checkpoint :

- **DC1 / DC2 / DC4** amorçaient l'identité juridique du client par `PATCH /clients/:id/legal-identity`.
  Cette identité n'est pas accessoire : dans plusieurs de ces tests elle est le **leurre** dont on
  prouve que le résolveur ne le lit JAMAIS à la place de l'entreprise candidate. Elle est donc
  désormais créée directement en base — donnée historique existante, exactement ce que I.1 décrit.
  La supprimer aurait affaibli la preuve au lieu de l'adapter.
- **`integrations-http`** créait deux Tenders sans entreprise candidate, ce que POLICY A (CCV2-G.1)
  refuse. Un candidat **réel** leur a été fourni, jamais un contournement du contrôle ; l'ordre de
  suppression au teardown a été corrigé (Tenders avant `CandidateCompany`, sinon la FK composite
  `[candidateCompanyId, organizationId]` met `organization_id` — NOT NULL — à NULL).

### Les 3 échecs résiduels, établis préexistants

| Spec | Constat | Preuve de non-imputabilité |
| --- | --- | --- |
| `scripts/compliance-probe.spec.ts` | Importe `src/shared-kernel/ai-model-defaults`, absent de cette branche | Fichier committé en `d2da8fe`, **non modifié** (`git status` vide) |
| `dashboard-query-bounding` (2 tests) | Capture SQL du bornage de requêtes | `P2-DASHBOARD-SQL-CAPTURE`, antériorité déjà établie par comparaison de base git |
| `scoped-outbox-test-harness` (1 test) | 100 lignes `FOREIGN_EVENT` ne restent pas toutes `Pending` | Le spec **ne démarre aucun `AppModule`** ; sa fermeture de dépendances (`src/modules/outbox/`, `prisma.service.ts`) est **identique à HEAD** ; la migration I.1 ne touche que `document_client_account_associations` |

---

## 9. Ce qui n'a pas été fait, et pourquoi

**Le throttle d'authentification n'a pas été assoupli.** `dashboard.spec.ts` enchaîne 7 connexions
dans un même fichier et partage le bucket `auth` (10 / 60 s) : ses deux derniers tests expirent sur
`login`. Exécutés isolément, **ils passent tous les deux** — y compris les assertions de la checklist
d'activation, c'est-à-dire précisément ce que I.1 modifie. Le défaut est dans le harnais, pas dans le
produit ; élargir la limite masquerait une protection réelle pour verdir un test.

**Aucun commit, aucun push.** Contrainte de mission maintenue.

---

## 10. Registre P2

| Réf | Constat | Statut |
| --- | --- | --- |
| `P2-CLIENT-SATELLITE-READ-SEMANTIC` | Les satellites non bancaires migrés restent servis par la route client (fuite **sémantique**, sans franchissement de rang de permission). Correction volontairement différée : CCV2-B §9 promet ce chemin de lecture Legacy. | Ouvert → I.2 |
| `P2-DASHBOARD-SQL-CAPTURE` | 2 tests de bornage SQL du dashboard en échec, **préexistants** à I.1 (établi par comparaison de base git plus tôt dans la session). | Ouvert, hors périmètre |
| `P2-CLIENT-ROUTES-RETIREMENT` | Les 29 routes `/clients/:id/*` de candidature subsistent en lecture. | Ouvert → I.2 (mission §24) |
| `P2-AUTH-THROTTLE-E2E-BUCKET` | `dashboard.spec.ts` épuise le bucket `auth` (10 / 60 s) au sein d'un même fichier ; ses 2 derniers tests expirent sur `login` et passent en isolation. Défaut de harnais, **pas** de produit. | Ouvert, throttle volontairement inchangé |
| `P2-OUTBOX-HARNESS-SCOPED-PUBLISH` | `scoped-outbox-test-harness` : 1 test échoue même isolé. Hors périmètre I.1 (fermeture de dépendances identique à HEAD). | Ouvert, préexistant |
| `P2-COMPLIANCE-PROBE-MISSING-MODULE` | `scripts/compliance-probe.ts` importe un module absent de la branche. | Ouvert, préexistant |

---

## 11. Verdict

`CCV2_I1_CERTIFIED`

Séparation sémantique établie et prouvée sur HTTP, PostgreSQL et navigateur réels ; aucune donnée
supprimée, déplacée ni convertie ; aucun commit, aucun push ; throttle et garde bancaire candidate
inchangés.
