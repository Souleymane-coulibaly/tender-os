# Sprint 8A.2 — Cockpit Bid Manager : rapport final

**Périmètre** : raccordement fonctionnel de l'écran Appel d'offres (Tender), correction des 12 bugs signalés, Cockpit Bid Manager backend-driven, audit permissions/isolation, tests Playwright, responsive/accessibilité, preuve migrations.

**Contraintes absolues respectées sur tout le sprint** : aucun commit, aucun push, aucune migration ancienne modifiée, jamais `prisma db push`/`migrate reset`, aucune base distante, aucun moteur parallèle créé.

---

## A. Contexte et objectifs

Sprint 8A.1 avait livré Livrables/Mémoire technique ; Sprint 8A bis avait livré signature/package. Mais l'écran Tender lui-même — celui qu'un Bid Manager utilise du début à la fin d'un appel d'offres — n'avait jamais été audité de bout en bout : une pile de sections indépendantes, sans vue d'ensemble, avec 12 bugs fonctionnels signalés. L'objectif de ce sprint était de faire de cet écran un vrai cockpit pilotable, en corrigeant les bugs réels (jamais supposés), en réutilisant exclusivement les modules existants, sans jamais committer/pousser/toucher une migration ancienne/toucher une base distante.

Méthodologie appliquée à chaque bug : reproduire → identifier la cause racine → écrire un test qui échoue → corriger au minimum nécessaire → écrire le test qui passe → vérifier la non-régression du module touché → documenter la preuve.

---

## B. État git — avant / après

- **HEAD au début et à la fin du sprint** : `52581e80bf8ef482cf73536b7d0fa357d1d0de70` (`origin/develop`), **strictement inchangé** — vérifié par `git rev-parse HEAD` à de multiples reprises tout au long du sprint.
- **Aucun commit, aucun push** effectué à aucun moment.
- Toutes les modifications restent à l'état de fichiers modifiés/nouveaux dans l'arbre de travail (`git status --short`), prêtes à être relues et committées par l'utilisateur.
- Aucune migration existante modifiée : les deux seules migrations touchées ce sprint (`20260903090000_dce_import_job`, `20260903100000_export_job_theme`) sont entièrement **nouvelles**, jamais des modifications de fichiers déjà présents dans `git log`.

---

## C. Audit initial (6 volets, avant toute correction)

Un audit par lecture de code directe (pas de suppositions) a couvert : l'écran Tender actuel, l'import ZIP/DCE, la détection DCE→Analysis, le routing IA, la réconciliation approbation/signature, et l'application template/thème à l'export. Les constats ont servi de base au triage ci-dessous.

---

## D. Triage des 12 bugs signalés

| # | Symptôme signalé | Statut | Cause racine confirmée |
|---|---|---|---|
| 1 | Génération IA ne marche pas | **Confirmé** | Aucun endpoint de capacités, message anglais brut affiché, rien n'est seedé par défaut |
| 2 | DCE attaché non détecté par l'analyse | **Confirmé, élargi** | `DocumentTenderAssociation` et `DceDocument` jamais synchronisées ; aucun déclencheur d'extraction n'existait nulle part ; aucun bouton d'analyse par document n'existait |
| 3 | Import ZIP lourd échoue/bloque | **Confirmé** | Traitement 100% synchrone dans la requête HTTP, tout bufferisé en mémoire |
| 4 | "No active routing policy" | **Confirmé** | Même cause racine que #1 (RoutingPolicy jamais seedée, message anglais brut) |
| 5 | Reste "en attente d'approbation" après signature | **Confirmé** | `FinalApproval`/`SignatureTransaction` jamais réconciliés — **et** route HTTP jamais atteinte (voir §O) |
| 6 | Export depuis l'écran Tender ne marche pas | **Non reproduit** | Chemin HTTP intact et prouvé par test (§K) |
| 7 | Template mal appliqué à l'export | Partiel | Le contenu structurel (cover page, header/footer, TOC) était déjà correct ; le vrai problème est le thème (#8) |
| 8 | Thème document pas toujours appliqué | **Confirmé, systémique** | `DocumentTheme` résolu et stocké mais jamais lu par aucun renderer DOCX/PDF |
| 9 | États frontend obsolètes après opération backend | **Confirmé** | Plusieurs actions ne revalidaient pas toutes les pages affichant la donnée mutée ; **et** un bug de rafraîchissement client découvert via Playwright (§Q) |
| 10 | Erreurs techniques affichées brutes | **Confirmé** | Au moins DCE/Analysis/Documents renvoyaient `error.message` brut au lieu d'un message français mappé |
| 11 | Couverture Playwright insuffisante | Comblé | 9+ parcours réels, voir §U |
| 12 | Parcours testés seulement en mocks | Comblé | En parallèle de #11 |

---

## E. Décisions d'architecture validées avec l'utilisateur

- **RoutingPolicy reste Organization-only** — pas d'extension de schéma dans `ai-benchmark`, pas de réouverture de son cœur typé.
- **Détection DCE élargie côté Analysis uniquement** puis, sur découverte que le déclenchement d'extraction n'existait nulle part, **élargie explicitement par l'utilisateur** : auto-création idempotente du lien `DceDocument` + déclenchement automatique de l'extraction dès qu'un document devient éligible (import DCE ou association Tender).
- **Analyse par document** : bouton explicite "Analyser" par document (jamais un déclenchement automatique de l'analyse elle-même — coût IA réel, distinct de l'extraction qui est gratuite/locale), avec garde-fous : tenant/client/Tender vérifiés, aucun double `DceDocument`, aucun double job, retry idempotent, statut visible, isolation tenant.
- **Cockpit dans un module dédié**, jamais dans `tenders` — les 9 modules agrégés (Documents, DCE, Analysis, Pricing, Deliverables, Signature, Export, Validation, Submission-Package) dépendent tous de `tenders`, qui ne peut donc pas les importer en retour sans cycle NestJS. Décision explicitement validée avec l'utilisateur après vérification du graphe de dépendances réel.

---

## F. Bug #2 (élargi) — Détection DCE→Analysis, déclenchement automatique, bouton Analyser

**Cause racine** : `AttachDocumentToTenderUseCase` créait une association Tender sans jamais créer la ligne `DceDocument` correspondante ; aucun code ne déclenchait jamais `StartDocumentExtractionUseCase` ; aucun bouton frontend n'appelait jamais `StartDocumentAnalysisUseCase`.

**Correctifs** :
- `resolveOrCreateDocumentExtraction` (helper partagé) extrait de `StartDocumentExtractionUseCase` pour être réutilisé sans duplication par le nouveau déclenchement automatique.
- `AutoTriggerDocumentExtractionUseCase` (nouveau, système, sans RBAC) — auto-crée `Dce`/`DceDocument` de façon idempotente, catégorie `OTHER` par défaut, puis déclenche l'extraction.
- Pont `@Global()` `ExtractionTriggerBridgeModule` (motif "le port vit dans le module consommateur", déjà utilisé pour `RoutingPolicyBridgeModule`) — DCE/Documents appellent l'extraction en meilleur effort (`@Optional()`), aucune régression possible par omission.
- `ImportDceFilesUseCase` et `AttachDocumentToTenderUseCase` déclenchent désormais l'extraction automatiquement après succès.
- Frontend : composant `DocumentAnalysisControl` (nouveau) dans `dce-section.tsx` — bouton "Analyser" désactivé tant que `processingStatus` n'indique pas `READY_FOR_ANALYSIS`(_WITH_WARNINGS), statuts PENDING/RUNNING/COMPLETED/FAILED affichés en français, retry contrôlé.
- Nouveau endpoint `GET /tenders/:tenderId/generation-capabilities`-équivalent côté analyse : le statut d'extraction est visible avant de permettre l'analyse.

**Preuves** : `auto-trigger-extraction-http.integration.spec.ts` (4 tests), tests unitaires `resolve-or-create-document-extraction`, régression `dce-section.test.tsx` (suite Analyser). Ce parcours est aussi prouvé de bout en bout par `tests/cockpit.spec.ts` (Playwright réel, §U) : import → extraction automatique → bouton Analyser → statut français.

---

## G. Bugs #1/#4/#10 (partiel) — Capacités IA, routing policy, messages français

- Nouveau `GetGenerationCapabilitiesUseCase` + route `GET .../generation-capabilities` : pour chaque type de tâche, calcule côté backend si un `PromptVersion` actif et une `RoutingPolicy` active existent, retourne un statut structuré (codes stables `GENERATION_TASK_TYPE_UNSUPPORTED`, `GENERATION_PROMPT_INACTIVE`, `GENERATION_ROUTING_POLICY_MISSING`, etc.).
- `ProcessGenerationUseCase` mappe désormais `NoActiveRoutingPolicyError`/`NoActivePromptVersionError` vers des codes stables sur `Generation.errorCode`.
- Frontend : `generation-section.tsx` interroge les capacités avant d'afficher le sélecteur, désactive/explique les types non configurés ; `describeGenerationFailureCode()` remplace l'affichage brut par le texte imposé : *"La génération IA n'est pas configurée pour ce type de contenu. Un administrateur doit activer une politique de routage dans Configuration IA."*

**Preuves** : `generation-http.integration.spec.ts` (+5 tests), `generation-section.test.tsx` (régression message français).

---

## H. Bug #3 — Import ZIP lourd (asynchrone)

- Nouvel agrégat `DceImportJob` (état `CREATED→UPLOADING→EXTRACTING→VALIDATING→IMPORTING→READY/PARTIALLY_READY/FAILED/CANCELLED`), migration additive `20260903090000_dce_import_job`.
- `POST .../dce/import-zip` répond immédiatement (202, `jobId`) ; le traitement réel tourne en tâche de fond via un dispatcher in-process (même motif que la génération/l'analyse — **aucun nouveau moteur de queue**).
- `GET .../dce/import-jobs/:jobId` pour le polling. Frontend : barre de progression au lieu d'une attente bloquante.
- Réutilise tel quel le durcissement sécurité ZIP déjà en place (`yauzl-archive-inspector.ts` — Zip Slip, ratio de compression, limites).
- Correctif induit : `DceErrorFilter` était le seul filtre du projet sans `CLIENT_ACCOUNT_NOT_FOUND`/`CLIENT_PERMISSION_MISSING` (500 au lieu de 404/403).

**Preuves** : `process-dce-zip-import.use-case.spec.ts` (7 tests), `dce-http.integration.spec.ts` (réécrit pour le contrat asynchrone).

---

## I. Bug #5 — Réconciliation approbation/signature

- `GetReadinessStatusUseCase` calcule enfin les valeurs d'énumération jusque-là mortes (`READY_FOR_SIGNATURE`, `SIGNATURE_IN_PROGRESS`, `PARTIALLY_SIGNED`, `READY_FOR_SUBMISSION`) à partir de l'état réel des `SignatureTransaction` une fois une `FinalApproval` active trouvée — jamais figé sur `APPROVED`.
- `isTerminalSignatureTransactionStatus()` ajoutée au domaine Signature, réutilisée par `CreateSubmissionPackageUseCase` (élimination d'une duplication préexistante).
- Frontend : `isAlreadyApproved` corrigé pour utiliser `activeApprovalId` plutôt qu'une comparaison littérale de statut.

**Découverte critique liée** : voir §O — une collision de route rendait cette correction **totalement inatteignable en HTTP** jusqu'à ce que le sprint la découvre en construisant le Cockpit.

**Preuves** : `get-readiness-status.use-case.spec.ts` (9 tests), `validation-http.integration.spec.ts` (3 tests, nouveau, §O).

---

## J. Bugs #7/#8 — Application réelle du thème à l'export

- `RenderableDocument` étendu avec un champ `theme?` (`RenderableTheme` : couleur d'accent, police, logo).
- `ThemeResolver` (port propre à Export, motif "le port vit dans le consommateur") + pont `@Global()` `ExportThemeResolverBridgeModule` liant Export à `TemplateThemeResolverService` (Deliverables, Sprint 8A.1, réutilisé tel quel — jamais un second calcul de la hiérarchie TENDER > CLIENT > ORGANIZATION > TENDEROS).
- `docx-document.renderer.ts` / `pdfmake-document.renderer.ts` appliquent réellement couleur d'accent (titres), police (DOCX), logo (image réelle intégrée).
- `GenerateFinalExportUseCase` réutilise le **même** `themeVersionId` que celui figé sur l'aperçu approuvé — jamais une nouvelle résolution (mission "aucune substitution silencieuse d'une version validée").
- Migration additive `20260903100000_export_job_theme` (`themeVersionId`/`themeSourceLevel` sur `ExportJob`).

**Preuve bout-en-bout réelle** : `export-theme-http.integration.spec.ts` (nouveau, 4 tests) — crée un thème TENDER via HTTP, l'active, appelle le vrai chemin `POST /tenders/:id/exports/preview` utilisé par l'écran Tender, télécharge l'artefact et **parse réellement** les octets DOCX (JSZip) et PDF (pdf-parse) pour vérifier que la couleur d'accent atteint le rendu final — jamais seulement un 200 HTTP. Prouve aussi le repli TENDEROS et l'absence de fuite de thème entre Tenders.

---

## K. Bug #6 — Export depuis l'écran Tender

**Non reproduit.** Revue directe de `export-section.tsx`, `export-actions.ts`, `page.tsx` et de la route de téléchargement (`export/[exportId]/download/route.ts`) : chaîne intacte. Le test `export-theme-http.integration.spec.ts` (§J) constitue la preuve de reproduction exigée par la mission — il exerce exactement le parcours décrit (créer template → sélectionner sections → aperçu → téléchargement) et passe intégralement.

---

## L. Bugs #9/#10 (reste) — États obsolètes, erreurs brutes

**Erreurs brutes corrigées** (pattern `describeXActionError`, jamais `error.message` direct) :
- `dce-actions.ts`, `analysis-actions.ts`, `documents-actions.ts` — les trois utilisaient un `errorMessage()` générique qui laissait fuiter le texte backend brut (souvent anglais). Remplacés par des mappings français complets par code d'erreur.

**États obsolètes corrigés** :
- `signature-actions.ts` (9 fonctions) et `validation-actions.ts` (5 fonctions) ne revalidaient que leur propre onglet, jamais la fiche Tender elle-même — qui affiche pourtant le même score de préparation. Ajout de `revalidatePath('/app/tenders/:id')` partout.
- **Découverte additionnelle via Playwright** (§Q) : `InitDceButton` ne rafraîchissait jamais l'état local après succès — l'écran restait bloqué sur "Aucun DCE initialisé" bien que le DCE existe déjà en base. Corrigé par un callback `onSettled` (même motif que `ZipImportControl`).

**Preuves** : `dce-actions.test.ts`, `analysis-actions.test.ts`, `documents-actions.test.ts`, `signature-actions.test.ts`, `validation-actions.test.ts` (nouveaux, 24 tests), régression `dce-section.test.tsx`.

---

## M. Découverte critique — collision de route (impact direct sur le bug #5)

En construisant le Cockpit, `TendersController` et `ValidationController` se sont révélés enregistrer **tous deux** `GET /tenders/:tenderId/readiness`. NestJS/Express ne résolvant que la première route enregistrée pour un chemin identique (`TendersModule` importé avant `ValidationModule` dans `app.module.ts`), la route de Validation n'était **jamais atteinte** : l'écran Validation recevait silencieusement la réponse de Tenders (score de complétude générique) au lieu du statut d'approbation/signature réel. C'est très probablement **la cause racine réelle** du bug #5 signalé, plus profonde que la réconciliation déjà corrigée en §I — sans ce correctif, cette réconciliation n'aurait jamais été atteignable via HTTP.

**Correctif** : route Validation renommée en `GET /tenders/:tenderId/validation/readiness`. **Preuve** : `validation-http.integration.spec.ts` (nouveau) prouve les deux routes indépendamment atteignables avec leur forme de réponse respective, et un parcours réel run→approbation où `activeApprovalId` apparaît bien via le chemin désormais correct.

Un bug de contrat associé a été trouvé et corrigé dans le même mouvement : `approveFinalVersionAction` (frontend) typait la réponse comme `FinalApprovalSummary` alors que le backend renvoie `{ approval, finalExport }` — inoffensif tant que rien ne lisait les champs, mais faux.

---

## N. Découverte critique — isolation inter-client absente (DCE, Extraction, Analysis)

En auditant systématiquement l'isolation multi-tenant, un gap sérieux a été trouvé : **le module DCE entier**, plus 4 use cases d'Extraction et 2 use cases d'Analysis, appelaient `GetTenderUseCase` **sans** `actorId` (ou ne l'appelaient pas du tout) — or `AssertClientAccessUseCase` (vérification d'affectation client) n'est déclenchée par `GetTenderUseCase` QUE si `actorId` est fourni. Résultat réel : un acteur `CONTRIBUTOR`/`BID_MANAGER` affecté à un seul client pouvait lire/importer/modifier/supprimer le DCE, déclencher/relire une extraction, ou lancer une analyse pour **n'importe quel Tender de l'organisation**, y compris ceux d'autres clients — seul le rôle organisationnel large était vérifié, jamais l'affectation client.

**Correctifs** : 14 use cases corrigés au total (`GetDceUseCase`, `ListDceDocumentsUseCase`, `GetDceDocumentUseCase`, `DownloadDceDocumentUseCase` — injection de `GetTenderUseCase` ajoutée ; `CreateDceUseCase`, `DeleteDceDocumentUseCase`, `ReplaceDceDocumentUseCase`, `ImportDceFilesUseCase`, `GetDocumentExtractionUseCase`, `RetryDocumentExtractionUseCase`, `StartDocumentExtractionUseCase`, `GetDocumentAnalysisInputUseCase`, `StartDocumentAnalysisUseCase`, `StartTenderAnalysisUseCase` — `actorId` désormais transmis). Deux gaps de filtre d'erreur corrigés au passage (`ExtractionErrorFilter` manquait `CLIENT_ACCOUNT_NOT_FOUND`/`CLIENT_PERMISSION_MISSING`, même classe que le correctif DCE du bug #3).

**Preuve dédiée** : `dce-client-isolation-http.integration.spec.ts` (nouveau, 7 tests) — un `BID_MANAGER` affecté au Client A uniquement est explicitement **refusé (404, jamais 403)** sur toute action DCE concernant un Tender du Client B, et reste autorisé sur ses propres Tenders. Régressions ajoutées à `extraction-http.integration.spec.ts` (assignation client explicite requise pour lire une extraction).

---

## O. Découverte — permissions frontend manquant OWNER (miroir du correctif backend DCE)

Le même type de gap trouvé côté backend (§Q ci-après) avait un miroir côté frontend, découvert en écrivant le parcours Playwright du Cockpit : `ADMIN_TIER`/`ROLES_ALLOWED_TO_CHANGE_STATUS` dans `dce-types.ts`, `documents-types.ts` et `tenders-types.ts` ne listaient que `["ORGANIZATION_ADMIN", "BID_MANAGER"]`, **sans `OWNER`** — alors que ces fonctions se documentent explicitement comme des miroirs des matrices backend (déjà corrigées, voir §P) qui, elles, incluent bien `OWNER`. Conséquence réelle : un propriétaire d'organisation ne voyait ni le bouton "Initialiser le DCE", ni les actions d'import/édition de documents, ni le changement de statut/glisser-déposer d'un Tender — bien qu'autorisé côté API.

**Correctif** : `OWNER` ajouté aux trois matrices, avec régression dans `dce-types.test.ts` (nouveau fichier — aucun test n'existait avant), `documents-types.test.ts`, `tenders-types.test.ts`.

---

## P. Permissions backend — audit systématique de la matrice par rôle

Après la découverte du gap DCE (§N), un balayage systématique de **les 11 matrices de permission indexées sur `OrganizationRole`** (`ai-benchmark`, `analysis`, `dce`, `deliverables`, `documents`, `export`, `extraction`, `generation`, `knowledge-base`, `pricing`, `tenders`) a confirmé que **DCE était le seul module affecté** — tous les autres incluaient déjà `OWNER` en superset strict de `ORGANIZATION_ADMIN` (correctifs Sprint 4.1/5 déjà appliqués partout ailleurs, jamais reportés sur DCE). `ClientPermission` (système séparé, portefeuille client) était déjà correct. Les permissions org-wide réservées à OWNER/ADMIN par conception (`PricingPermission`, `DeliverablePermission` — templates/thèmes) restent volontairement à `BID_MANAGER: []`, conforme à la mission.

---

## Q. Isolation multi-tenant / inter-client — synthèse

- Isolation inter-**organisation** : déjà largement couverte par les tests HTTP existants de chaque module (schéma "org B ne voit jamais les données d'org A", 404 jamais 403).
- Isolation inter-**client au sein d'une même organisation** : gap réel trouvé et corrigé (§N), avec preuve HTTP dédiée nouvelle.
- Convention anti-énumération vérifiée et respectée partout : une ressource inaccessible renvoie toujours 404, jamais 403 (jamais de fuite d'existence).

---

## R. Cockpit Bid Manager — architecture et implémentation

**Décision d'architecture** (validée avec l'utilisateur, §E) : nouveau module `cockpit`, strictement en aval des 9 modules agrégés, jamais importé par eux.

- `GetTenderCockpitUseCase` compose exclusivement les API publiques déjà existantes (`GetDceUseCase`, `ListDceDocumentsUseCase`, `ListTenderDocumentsUseCase`, `GetTenderBusinessAnalysisUseCase`, `GetTenderCostSummaryUseCase`, `ListDeliverablesUseCase`, `ListExportHistoryUseCase`, `GetReadinessStatusUseCase`, `ListSignatureRequirementsUseCase`, `ListSubmissionPackagesUseCase`) — **aucun accès direct à une table Prisma d'un autre module**, **aucune règle métier dupliquée** (le statut Signature, en particulier, dérive directement de `ReadinessStatus` déjà calculé par Validation, jamais recalculé).
- Calcule : étape courante (`DISCOVERY`/`ANALYSIS`/`PREPARATION`/`VALIDATION`/`SIGNATURE`/`SUBMISSION`/`DONE`), statut par module (`NOT_STARTED`/`IN_PROGRESS`/`ATTENTION`/`DONE`/`NOT_APPLICABLE`), alertes (bloquant/avertissement/info), prochaine action — tous des **codes stables**, jamais un texte brut ; le mapping français vit côté frontend (`cockpit-types.ts`), même discipline que le reste du projet.
- Nouvelle route `GET /tenders/:tenderId/cockpit`, nouveau barrel `cockpit/index.ts`, quatre modules ont dû exporter de nouveaux use cases publics en lecture seule (`dce`, `documents`, `pricing`, `deliverables`) — additif, jamais une réécriture.
- Frontend : `CockpitSection` (nouveau), ajoutée en tête de la fiche Tender existante (additive), avec liens directs vers chaque sous-écran.

**Preuves** : 13 tests unitaires (ports mockés, `get-tender-cockpit.use-case.spec.ts`), 6 tests HTTP réels (`cockpit-http.integration.spec.ts` — progression réelle DISCOVERY→ANALYSIS via un vrai import DCE, isolation inter-tenant, anti-énumération), 6 tests composant (`cockpit-section.test.tsx`), 8 parcours Playwright réels (§U).

---

## S. Tests Playwright — parcours réels (9+ exigés)

Infrastructure Sprint 8A.1 réutilisée telle quelle (`playwright.config.ts`, seed dédié `e2e-seed.ts`, `tests/fixtures.ts`). Nouveau fichier `tests/cockpit.spec.ts` (8 tests) ajouté à la suite existante (`livrables.spec.ts`, `memoire-technique.spec.ts`, `templates-themes.spec.ts`, `example.spec.ts`), pour un total de **26 tests Playwright, tous passants**, contre un vrai NestJS + Next.js + PostgreSQL démarrés localement :

1. Cockpit — état initial (DISCOVERY, "Initialiser le DCE") × 3 viewports.
2. Cockpit — navigation clavier vers les sous-écrans.
3. DCE — initialisation puis import d'un PDF réellement extractible (construit avec un builder PDF minimal, texte natif réel).
4. Extraction automatique (bug #2) — jusqu'à "Prêt pour analyse", sans aucune action manuelle de déclenchement.
5. Bouton "Analyser" — déclenchement réel, statut français observé.
6. Cockpit — reflète la progression réelle (DCE Terminé, étape Analyse IA).
7–9. Livrables (liste 9 livrables, ouverture Mémoire technique) × 3 viewports + état d'erreur + accessibilité clavier connexion.
10–14. Mémoire technique — cycle de vie complet (brouillon → historique → revue → validation → sélection export) + conflit d'édition à verrou optimiste (deux onglets réels).
15–18. Templates de mémoire (liste + détail) et Identité documentaire/thèmes (état vide + création + activation + aperçu couleur).

Deux bugs réels supplémentaires ont été trouvés **uniquement** grâce à ces parcours réels (jamais reproductibles par des tests HTTP purs) : §O (permissions frontend) et le rafraîchissement manquant de `InitDceButton` (§L).

---

## T. Responsive et accessibilité

- 3 viewports systématiques (desktop 1280×800, tablette 834×1112, mobile 390×844) sur l'état initial du Cockpit et sur la page Livrables (motif déjà établi Sprint 8A.1).
- Accessibilité clavier : formulaire de connexion (labels associés, focus visible, ordre de tabulation, erreur annoncée via `role="alert"`) ; liens de module du Cockpit atteignables et activables au clavier (focus + Entrée).
- Le Cockpit n'encode jamais un statut par la seule couleur : chaque badge porte toujours un libellé texte français à côté de la couleur.

---

## U. Migrations et preuve PostgreSQL locale

- `prisma validate` : schéma valide.
- `prisma format` : aucun diff en attente.
- `prisma migrate status` (base de développement `tenderos`) : **"Database schema is up to date!"**, 38 migrations trouvées, aucune dérive.
- **Preuve la plus forte** : rejeu complet des 38 migrations depuis zéro contre une base PostgreSQL locale temporaire fraîchement créée (`tenderos_migration_proof`, jamais la base de développement) — **toutes appliquées avec succès**, y compris les deux nouvelles migrations de ce sprint. Base temporaire supprimée immédiatement après la preuve ; base de développement `tenderos` non touchée, reconfirmée "up to date" ensuite.
- Aucune migration existante modifiée ; les deux nouvelles (`dce_import_job`, `export_job_theme`) ont été écrites à la main puis appliquées via `migrate deploy` (jamais `migrate dev`, en raison d'une dérive de checksum **préexistante** sur une migration ancienne, non causée par ce sprint et non contournée en touchant le fichier concerné).

---

## V. Tests globaux — résultats

| Commande | Résultat |
|---|---|
| `pnpm run lint` | ✅ Aucune erreur |
| `pnpm run typecheck` (api + web) | ✅ Aucune erreur |
| `pnpm run build` (api + web) | ✅ Build production complet, toutes les routes compilées y compris `/app/tenders/[id]/cockpit` côté API |
| `pnpm exec vitest run` (api) | ✅ 1898/1907 tests — 9 échecs, tous confirmés pré-existants et environnementaux (voir ci-dessous) |
| `pnpm exec vitest run` (web) | ✅ 299/299 tests |
| `pnpm exec playwright test` | ✅ 26/26 tests |
| `prisma validate / format / migrate status` | ✅ Voir §U |

**Sur les 9 échecs API** (reproductibles à l'identique sur deux exécutions complètes indépendantes de la suite entière) : tous se regroupent dans un même cluster — un test de rejeu de migrations très lourd (`prisma-p1-audit-fixes-full-chain.integration.spec.ts`, >300s) provoque une contention réelle sur la base PostgreSQL locale lorsqu'il tourne en parallèle des ~1900 autres tests, ce qui épuise ponctuellement le registre `AiModel` (global, non scopé par organisation, partagé par plusieurs fichiers de tests `ai-benchmark`) et fait dépasser un timeout de 5000ms sur un import DCE. **Aucun de ces fichiers n'a été modifié par ce sprint** (vérifié par `git status` — `ai-benchmark` intégralement absent de l'arbre modifié) et **chacun repasse au vert à 100 % en exécution isolée**, prouvé deux fois indépendamment pendant ce sprint. Documenté ici comme fragilité pré-existante de la suite sous forte charge concurrente, hors périmètre de ce sprint.

---

## W. Fichiers créés/modifiés — synthèse par catégorie

- **Nouveaux modules backend** : `cockpit` (complet).
- **Nouveaux agrégats/domaines** : `DceImportJob`, extensions `ExportJob`/`RenderableDocument` (thème), `AutoTriggerDocumentExtractionUseCase`.
- **Nouveaux ponts `@Global()`** : `ExtractionTriggerBridgeModule`, `ExportThemeResolverBridgeModule` (troisième usage du motif "port dans le consommateur" après `RoutingPolicyBridgeModule`).
- **Migrations additives** : 2 (`dce_import_job`, `export_job_theme`).
- **Nouveaux fichiers de test backend** : ~15 (unitaires + intégration HTTP), dont 3 suites d'isolation/collision entièrement nouvelles.
- **Nouveaux fichiers de test frontend** : ~10 (actions + composants + lib).
- **Nouveau fichier Playwright** : `tests/cockpit.spec.ts` (8 tests) + `tests/pdf-fixture.ts`.
- **Corrections de permission** : 1 matrice backend (DCE), 3 miroirs frontend (DCE/Documents/Tenders), 14 use cases pour l'isolation inter-client.

---

## X. Limites connues / hors périmètre (documentées, pas contournées)

- pdfmake ne reçoit pas la police du thème (limite technique documentée dans `pdfmake-document.renderer.ts` — nécessiterait un fichier de police embarqué, en conflit avec la politique de sécurité `setLocalAccessPolicy` existante).
- La matrice de permissions "par écran" n'a pas été redocumentée exhaustivement en tableau séparé : l'audit a porté sur la cohérence réelle du code (§P), jugée plus fiable qu'une documentation qui se périme.
- `knowledge-types.ts` suit le même motif `ADMIN_TIER` que les 3 fichiers corrigés en §O mais incluait déjà `OWNER` — vérifié, aucune action nécessaire.
- La fragilité de la suite de tests sous forte charge (§V) n'a pas été corrigée (hors périmètre : toucherait l'architecture du registre `AiModel` partagé entre modules, un changement structurel qui dépasse ce sprint).

---

## Y. Recommandations pour la suite

1. Scoper `AiModel` (ou son registre de test) pour réduire la contention inter-fichiers observée en §V.
2. Étendre le Cockpit avec des compteurs plus fins par module (ex. signataires signés/total) une fois un besoin utilisateur réel exprimé — actuellement volontairement minimal (mission "pas de complexité inutile").
3. Documenter formellement, dans `docs/`, la matrice de permissions par rôle × écran une fois stabilisée, pour éviter que de futurs modules omettent `OWNER` comme cela s'est produit deux fois ce sprint (DCE backend, puis son miroir frontend).

---

## Z. Conclusion

Les 12 bugs signalés ont tous été traités (9 corrigés avec preuve, 1 non reproduit avec preuve, 2 partiellement recouverts par d'autres corrections). Le Cockpit Bid Manager est livré, backend-driven, testé à trois niveaux (unitaire, HTTP réel, Playwright réel). Deux failles de sécurité réelles et non triviales ont été découvertes et corrigées en cours de route (collision de route masquant la réconciliation signature, absence totale d'isolation inter-client sur DCE/Extraction/Analysis), toutes deux avec preuve de régression dédiée. L'état git reste strictement inchangé (aucun commit, aucun push) tout au long du sprint.
