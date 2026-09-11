# TenderOS 2.1 — Corrections « sur tout le système » (W1 à W6)

Date : 2026-09-11 · Branche : `v2.1-fusion-pieces-demandees-checklist` · **Aucun commit** (non demandé).

Plan validé : cinq chantiers d'interface (W1–W5) + traduction des erreurs de l'API côté web par
code (W6, option « Plan + erreurs traduites côté web »).

---

## W1 — Libellés français au lieu des codes d'enum

Tables de libellés exhaustives (typées `Record<Enum, string>`, donc complètes à la compilation)
ajoutées dans `apps/web/src/lib/*-types.ts` : sévérités et statuts d'alertes/risques, types
d'échéances, criticité de checklist, priorités de tâches, statuts de versions (`version-status.ts`,
partagé), statuts satellites et références entreprise, statuts d'organisation et résultats d'audit
plateforme, catégories d'exigences (14) et de clauses (22), statuts de pièces/annexes, révisions
générées, fournisseurs IA. Branchées sur la fiche AO, l'espace de travail, « Mes tâches », les quatre
gestionnaires de versions, le profil entreprise, les sous-traitants, le back-office, l'analyse IA,
les livrables et les formulaires officiels.

Laissés tels quels à dessein : codes devise, textes libres saisis par l'utilisateur.

## W2 — Champ fichier unique (`FileInput`)

`components/ui/file-input.tsx` : input natif `sr-only` dans son `<label>`, bouton visible
« Choisir un fichier », nom du fichier (ou « N fichiers »), remise à zéro avec le formulaire.
Remplace les 12 `<input type="file">` natifs. Tests : 6/6.

## W3 — Sélecteurs au lieu d'identifiants tapés à la main

- `components/ui/search-select.tsx` : combobox accessible (clavier, `aria-activedescendant`, garde
  contre les réponses périmées). Tests : 7/7.
- Documents de la fiche AO : recherche d'un document de bibliothèque par son titre.
- Export : « Génération à reprendre » et « Estimation à reprendre » en listes.
- Pouvoirs de signature : preuve choisie parmi les documents du dossier administratif.
- API (additive) : `GET /tenders/:tenderId/administrative-documents`, autorisation
  (`ReadAdministrativeDossier`) vérifiée **avant** toute lecture. Spec 13/13, intégration 7/7.

## W4 — Boutons isolés, mesurés au navigateur

La sonde H.3-b (`tests/h3b-tender-column-overflow.spec.ts`) mesure désormais, en plus des
débordements intra-colonne et des contrôles recouverts, les **boutons seuls sur leur ligne** dans les
formulaires en ligne (flex qui passe à la ligne).

- Première mesure : 6 boutons signalés — **faux positifs** de la sonde, qui groupait les lignes par
  `top` égal alors que `items-end` aligne le BAS des éléments. Corrigé : même ligne = bandes
  verticales qui se chevauchent. Le diagnostic navigateur (largeur, `flex-basis` de chaque enfant) a
  établi la cause avant toute modification.
- Mesure corrigée — défauts réels : « Déposer et rattacher » (1024 et 1512 px), « Rattacher »
  (1024 px), « Ajouter » des Échéances (1512 px : 570 px demandés pour 550 disponibles).
- Correction indépendante de la largeur : le dernier champ et son bouton forment un groupe qui ne se
  sépare pas ; le formulaire garde son retour à la ligne (le message d'erreur reste dessous).
- Autre faux positif corrigé : `FileInput` masque volontairement son input natif dans son label ;
  un champ recouvert par **son propre label** reste atteignable.
- Largeurs ajoutées : 1366 et 1440 px (le défaut dépend de la largeur exacte).

**Résultat : 5/5 largeurs (1024, 1280, 1366, 1440, 1512) — aucun débordement, aucun contrôle
inatteignable, aucun bouton isolé.**

## W5 — Accents

Méthode : aucun remplacement global. Un inventaire liste les candidats, chaque correction est une
paire écrite et relue à la main, avec son nombre d'occurrences vérifié avant toute écriture.

- Inventaire v1 (liste de mots) : insuffisant — mots en fin de phrase manqués, clés d'enum et
  identifiants signalés à tort. Corrigé, puis remplacé par un inventaire v2 dont le vocabulaire est
  **tiré du code lui-même** (les mots déjà écrits accentués ailleurs), avec séparation des cas
  ambigus (valide/validé, a/à, ou/où, la/là, archive/archivé…) relus un par un.
- Corrections : ~110 paires sur ~45 fichiers (libellés de statuts « Prêt », « Gagné », « Archivé »,
  « Terminée », « Échouée », « Élevée »… ; formulaires AO, filtres, documents, analyse IA,
  checklist, Kanban, échéances, critères, lots).
- Tests unitaires et e2e alignés ; les specs e2e (qui tournent aussi contre le staging) acceptent
  les deux graphies.
- Laissés à dessein : textes corrects sans accent (verbes « expire », « analyse », « reste »,
  adjectifs « valide », « active »), commentaires de code, jeux de données de test.

## W6 — Erreurs de l'API traduites côté web, par code

- `apps/web/src/lib/api-error-messages.ts` : **578 codes** traduits (domaine + filtre global +
  exceptions HTTP génériques), repli par statut HTTP puis message générique — **jamais** le message
  brut de l'API.
- Test de contrat (`api-error-messages.contract.test.ts`) : lit les **sources** de l'API ; un code
  ajouté sans traduction, une traduction orpheline, une interpolation ou un code technique dans un
  message font échouer la suite.
- Les 35 fonctions `describe…Error` consultent la table d'abord (147 branches devenues redondantes
  retirées ; leurs meilleures formulations reprises dans la table). Trois branches contextuelles
  conservées **avant** la table : sentinelle de la veille, e-mail d'invitation inconnu, contexte de
  décision d'opportunité.
- `errorMessage` (actions AO et connaissances), actions du back-office et les deux écrans
  `ApiErrorState` n'affichent plus jamais le texte de l'API.
- **Sécurité** : un 404 de contrôle d'accès client (`CLIENT_ACCOUNT_NOT_FOUND`), déclenché aussi en
  agissant sur un AO ou un DCE, ne nomme pas la ressource vérifiée (invariant testé conservé).
- Import DCE (API, additif) : chaque fichier refusé porte un `code` issu d'une vraie erreur de
  domaine (`DCE_ARCHIVE_REQUIRES_ZIP_IMPORT`, `DCE_FILE_CONTENT_MISMATCH`, `DCE_DUPLICATE_FILE`, ou le
  code de validation) ; l'écran affiche le motif français, jamais `reason`. Une erreur non-domaine
  n'est plus avalée : elle interrompt l'import, comme la stratégie d'atomicité le documente.
- Analyse IA : le code technique d'échec (`AI_PROVIDER_NOT_CONFIGURED`…) n'est plus affiché ; la
  cause française apparaît sous l'en-tête.
- **Connexion (défaut trouvé par l'e2e)** : les deux actions de connexion (application et
  back-office) répondaient « Identifiants invalides. » à TOUT refus de l'API — y compris la limite de
  tentatives (429), un compte désactivé ou une panne serveur. Un utilisateur simplement ralenti était
  invité à se méfier d'un mot de passe correct. `lib/login-error.ts` lit désormais le code d'erreur :
  identifiants refusés, trop de tentatives, compte inactif, erreur serveur — et ne dit jamais
  « session expirée » sur l'écran de connexion. Tests : 6/6. Preuve navigateur : lors d'un passage
  e2e ralenti par la limite de tentatives, l'écran de connexion affiche désormais « Trop de
  tentatives. Patientez un instant avant de réessayer. » au lieu de « Identifiants invalides. ».

---

## Navigation de la fiche AO (après commit 7a2abc5)

Aucun document versionné ne spécifie la barre d'onglets V2.1 (le code cite une « mission §23 »
non versionnée). Vérifications : les 19 onglets mènent tous à une page existante ; l'ordre suit le
flux métier. Constats et corrections :

- **« Dossier final » / « Dossier de soumission »** : deux fonctions réellement distinctes (dossier de
  réponse assemblé par lot → ZIP ; package final immuable exigeant approbation et signature),
  nommées ainsi par décision (mission §22, `tender-nav-tabs.test.ts`). L'incohérence venait de la
  table W6, qui appelait « dossier final » le package de soumission : ses messages disent désormais
  « dossier de soumission ».
- **Ordre** (décision utilisateur) : « Dossier final » passe avant « Dépôt », qui s'appuie sur lui.
- **« Workspace » → « Collaboration »** (décision utilisateur) : le glossaire réserve « Tender
  Workspace » au dossier entier ; page « Espace collaboratif », specs e2e acceptant les deux titres.
- Page « Pricing & prévisions » renommée « Estimation & coûts IA », comme son onglet (décision 2.1-A5).

**Audit des onglets inutilisés** (demande utilisateur : supprimer les onglets non utilisés) : aucun
onglet mort — les 18 pages appellent des routes d'API existantes, aucune n'est marquée
décommissionnée. Trois recouvrements, conservés car encore requis : « Dossier de soumission » (le
Dépôt exige son package ; l'API le qualifie de wrapper legacy — seul vrai candidat à une
suppression, après que le Dépôt s'appuie sur le « Dossier final »), « Générations » (sources de
l'Export et des révisions de livrables), « Documents générés » (sorties du mémoire et des formulaires
DC1/DC2/DC4). Rien n'a été supprimé. Deux défauts corrigés au passage : les cartes « Documents &
DCE » et « Analyse » du Cockpit mènent désormais à leurs écrans (elles n'avaient aucun lien depuis
que le DCE a son onglet) ; la carte « Signature » du dossier administratif, qui affichait « Non gérée
à ce stade (phase ultérieure) », renvoie vers l'onglet Signature. Le message d'offre non incluse
s'accorde désormais quel que soit le libellé (« … : fonctionnalité non incluse dans votre offre »).

**Checklist — « Comparer avec la dernière analyse » ne semblait rien faire** (signalé par
l'utilisateur). Le bouton fonctionnait côté API, mais son effet était invisible et parfois trompeur :
il crée des SUGGESTIONS à valider (jamais d'éléments écrits directement — V2 Sprint 6 §22), qui
n'étaient affichées que sur la Vue d'ensemble ; sans analyse terminée ou sur une analyse déjà
comparée, il affichait « 0 nouvelle(s) suggestion(s) », indiscernable d'un succès ; l'écran n'était
pas rafraîchi. Corrigé : le panneau « Suggestions IA à valider » (restreint aux éléments de checklist,
sans « Générer les suggestions ») s'affiche sur l'écran Checklist ; un message exact pour chaque cas ;
rafraîchissement après succès. Au passage, une checklist vide n'affiche plus « 0 / 0 validés
(100%) ». Tests : +5 (web 565/565) ; e2e `checklist-intelligence` **2/2** dans le navigateur
(suggestion appliquée, écran Checklist, comparaison avec la dernière analyse, message affiché).

**Onboarding — « Impossible de créer l'organisation. Réessayez. »** (signalé par l'utilisateur). Le
message était le même pour TOUTE erreur — refus de l'API comme API injoignable — et masquait la
cause (journalisée seulement côté serveur web). Reproduction locale : la création via l'API réussit
(201), y compris avec un nom accentué, une raison sociale et un SIRET ; la tentative de l'utilisateur
n'apparaît pas dans les journaux locaux (environnement distant). Corrigé : un refus de l'API est dit
par son code (table W6), une API injoignable l'est comme telle, et l'étape « Compte » passe aussi par
la table pour les codes non traités. Ce correctif rend la cause visible ; il ne corrige pas une
éventuelle panne de l'environnement distant, à diagnostiquer avec le nouveau message.

**Cause réelle sur le staging** (journaux Railway, lecture seule — API déployée depuis la branche
`v2.1-checklist-onboarding`, `f7015d5`) : `POST /api/v1/organizations` → 500,
`prisma.role.findUniqueOrThrow()` — « No record was found for a query ». L'organisation est créée,
puis l'ajout du créateur comme OWNER échoue : les **rôles système** (OWNER, ADMIN…) et leurs
permissions sont des données de référence créées uniquement par `prisma/seed.ts`, qu'aucune migration
ne crée et que Railway ne lançait pas (pré-déploiement = migrations seules) ; la base staging,
redéployée le 2026-09-06, n'en contient pas. Même cause pour toute création de membre (invitation,
transfert de propriété). **Correctif (décision utilisateur)** : `railway.toml` enchaîne désormais
`prisma migrate deploy && prisma db seed` avant chaque déploiement — seed idempotent (upserts
projetés depuis les constantes du domaine, aucune donnée de démonstration), commande vérifiée en
local telle que Railway l'exécutera. Aucune écriture n'a été faite sur la base staging depuis ce
poste : le staging sera réparé au prochain déploiement.
Tests : `onboarding-actions.test.ts` (nouveau, 5 cas — refus par code, panne serveur, API
injoignable, session expirée, nom vide) ; web 570/570. E2E `onboarding.spec` : 5 réussis au premier
passage ; l'échec restant était un faux positif du test (il comptait l'annonceur de route de Next.js,
qui porte aussi role="alert"), corrigé comme dans les autres specs — relance : **9/9 verts**.

**« Une erreur inattendue est survenue. » sur Dossier administratif et Export** (signalé par
l'utilisateur, sur un environnement distant : aucune trace de ses clics dans les journaux locaux).
Ce message était le repli de l'écran d'erreur pour toute erreur qui n'était pas une instance
d'`AppApiError` — sans rien journaliser. Deux causes possibles, toutes deux traitées :
(1) API injoignable — observé en local (`TypeError: fetch failed … ECONNREFUSED`) pendant un
redémarrage de l'API ; (2) un vrai refus de l'API non reconnu, `instanceof` échouant quand l'erreur
vient d'une autre instance du module (actions serveur de Next.js). Corrigé dans les deux écrans
(espace organisation et back-office) : erreur d'API reconnue par sa forme (statut + code), message
« service momentanément injoignable » pour une panne réseau, et toute erreur inattendue journalisée
côté serveur — la prochaine occurrence sur l'environnement distant laissera une trace exploitable.
Module partagé `lib/page-load-error.ts` (réutilisé par l'onboarding). Tests : +10 (web 577/577 avant
le nouveau test de l'écran, 15/15 sur les écrans d'erreur).

Une fois l'écran rendu lisible, un diagnostic navigateur a révélé les **causes réelles** des deux
pages :

- **Export — route masquée (défaut présent depuis le Sprint 8A)** : `GET /api/v1/exports/templates`
  répondait 400. `ExportController`, enregistré avant `ExportTemplatesController`, déclare
  `GET exports/:exportId` et captait « templates » comme identifiant (refusé par la validation UUID).
  La liste des modèles d'export était donc en échec partout (onglet Export, Configuration IA). Les
  tests d'intégration ne faisaient que des `POST`, jamais ce `GET`. Corrigé : le contrôleur à chemin
  fixe est enregistré en premier (ordre commenté), et une garde de non-régression vérifie le `GET` de
  la liste dans `export-capabilities-http.integration.spec.ts` (4/4, PostgreSQL réel).
- **Dossier administratif — cause masquée** : la page crée le dossier s'il manque, mais ignorait le
  résultat. La création passe par le contrôle de droit (abonnement, essai ou Pass) ; refusée, elle
  laissait la lecture répondre « introuvable ». La page dit désormais la vraie cause (« Votre
  organisation n'a pas de droit actif… ») quand le dossier est absent parce que sa création a été
  refusée — sans bloquer un rôle en lecture seule devant un dossier existant.

Vérification navigateur après correction : l'Export se charge (« Export documentaire », « Nouvel
aperçu », « Historique ») ; le Dossier administratif affiche la cause réelle. API : typecheck 0,
lint 0 ; web : 581/581.

**Dossier administratif — page entière en échec sur staging** (« Application error », digest
`…@E7`, signalé après le déploiement de `7afe0f3`). Le diagnostic local précédent tournait avec une
organisation **sans** droit actif : la création du dossier y était refusée, et les deux chemins
fautifs, qui ne s'exécutent qu'avec un droit actif, n'étaient jamais atteints. Deux défauts réels, en
cascade :

1. **`revalidatePath` pendant le rendu (code Next `E7`)** : la page appelait la server action
   `ensureAdministrativeDossierAction`, qui revalide trois chemins après une création réussie — ce
   que Next interdit pendant un rendu. Avant `7afe0f3`, l'appel était dans le `try` et l'exception
   finissait en « Une erreur inattendue est survenue. » (le signalement initial) ; `7afe0f3` l'avait
   sorti du `try`, d'où la page blanche. Corrigé : la page crée le dossier par un appel direct à
   l'API, sans revalidation (le rendu qui suit lit l'état frais) ; l'action, sans autre appelant, est
   supprimée. Balayage de tout le front : plus aucune page ni aucun layout n'appelle une action qui
   revalide.
2. **Fonction passée à un composant client** : chaque carte de formulaire officiel (DC1, DC2, DC4)
   transportait `downloadHref`, une fonction, vers `OfficialFormsSection` (composant client) — refusé
   par React dès qu'un formulaire est disponible, donc dès qu'un droit actif existe. Corrigé :
   `FormCardSpec` ne porte plus que des données ; le composant construit le lien de téléchargement à
   partir de `tenderId` (`revisionDownloadHref`).

Vérification navigateur avec l'organisation abonnée du seed e2e (`fixture.cockpit`) : les 21 pages de
la fiche AO (19 onglets + checklist et vue structurée du dossier administratif) s'affichent sans
exception serveur ; le dossier administratif s'affiche aussi au second chargement (dossier déjà
créé). Web : typecheck 0, lint 0 erreur, 581/581.

**Dossier structuré (« Groupement, DC1/DC2/DUME, sous-traitance… ») — « Une erreur inattendue est
survenue. »** (signalé sur staging, reproduit en local avec les deux organisations du seed). Le
parcours précédent ne cherchait que la page blanche, pas l'écran d'erreur de chargement : il avait
laissé passer ce défaut, **présent depuis la création de la page (Sprint 8C)**. Cause : les routes
GET du groupement, du DC1, du DC2, du DUME et de l'acte d'engagement renvoient `null` tant que
l'élément n'existe pas ; NestJS répond alors 200 avec un corps **vide** (`isNil(body)` →
`response.send()`), et `appApiFetch` échouait sur `response.json()` (« Unexpected end of JSON
input ») — erreur qui n'est pas une réponse d'API, d'où l'écran générique, sur tout Tender dont le
dossier structuré n'est pas encore rempli. Corrigé dans le client (`readJsonBody`, partagé par
`appApiFetch` et `appApiFetchWithToken`) : un corps vide vaut `null`, ce que la page attend déjà.
Tests : `app-api-client.test.ts` (nouveau, 5 tests : corps vide, JSON, 204, erreur d'API, variante
à jeton). `public-api-client` et `platform-api-client` lisent aussi `response.json()` sans garde :
même risque théorique, non modifiés (aucun cas observé).

Vérification navigateur (organisation abonnée du seed e2e), en détectant cette fois la page blanche
**et** l'écran d'erreur de chargement : les 21 pages de la fiche AO s'affichent sans erreur (seules
alertes : les états vides « aucun prompt » sur Générations et « aucun modèle d'export » sur Export) ;
clic « Groupement, DC1/DC2/DUME… » depuis le dossier administratif → page structurée sans erreur ;
puis création, section par section, du groupement, du DC1, du DC2, du DUME, d'une sous-traitance
(DC4), de l'acte d'engagement et d'un pouvoir de signature — chaque action et chaque rechargement
sans erreur. Organisation sans droit actif : page structurée sans erreur. (Deux premiers passages
interrompus par l'environnement : mise en veille du poste sur batterie critique à 12:27, redémarrage
de l'API locale à la reprise — sans lien avec le code.)

E2E collaboration (après le renommage) : 2 réussis, 4 échecs **sans lien avec le renommage** (le
titre « Espace collaboratif » est bien trouvé). Causes préexistantes, prouvées par l'instantané :
(1) couplage d'ordre — `collaboration-validations.spec` ajoute déjà les participants sur le même
Tender du seed, le formulaire d'ajout de `workspace-collaboration.spec` n'a plus de candidat et
disparaît ; (2) jeu de données — les demandes de validation sont une fonctionnalité d'offre payante,
et l'organisation du seed n'a volontairement aucune offre (même cause que le parcours DCE du Cockpit).
Non corrigé : même décision de jeu de données que pour le Cockpit, à étendre si souhaité.

Web : typecheck 0, lint 0 erreur, tests unitaires 560/560. Piste plus structurante, non engagée :
regrouper les 19 onglets en 4 à 5 étapes (préparer, rédiger, chiffrer, valider et signer, déposer).

## Portes de qualité

| Porte | Résultat |
|---|---|
| Web — typecheck | 0 erreur |
| Web — lint | 0 erreur (1 avertissement `<img>` préexistant) |
| Web — tests unitaires | **560/560** (92 fichiers) |
| API — typecheck / lint / build | 0 / 0 / OK (`dist/main.js`) |
| API — tests unitaires (hors intégration) | 3642/3643 — 2 fichiers en échec **préexistants**, voir ci-dessous |
| API — DCE (import + ZIP) | 25/25 |
| API — dossier administratif | 13/13, intégration 7/7 |
| H.3-b (navigateur, 5 largeurs) | **5/5** |
| E2E — sous-ensemble des écrans modifiés | voir « E2E » |
| Web — build de production | voir « Reste à faire » |

### Échecs préexistants (non causés par ce chantier, non corrigés)

- `apps/api/scripts/compliance-probe.spec.ts` : importe `src/shared-kernel/ai-model-defaults`,
  absent depuis le décommissionnement (074551d).
- Contrat Outbox : `CandidateCompanyProfileUpdated` et `CandidateDocumentExpiringSoon` catalogués
  sans aucun producteur dans le code.

### Dérives de tests préexistantes, corrigées au passage

- `tender-actions.test.ts` : ne fournissait pas l'entreprise candidate, obligatoire depuis CCV2-G.1.
- Onglet « Documents de candidature » (renommé avant ce chantier) : test unitaire et e2e alignés.
- `checklist-intelligence.spec.ts` : cherchait la checklist sur le Cockpit alors qu'elle a son écran
  depuis be5f1fe.

### E2E

Premier passage (6 specs) : 21 réussis, 12 échecs, tous classés :

- libellé d'onglet « Documents » périmé (7) — préexistant, spec alignée ;
- message 404 désormais traduit (2) — **causé par W6** ; assertions alignées sur `/introuvable/i`
  dans les 8 specs concernées (accepte aussi l'ancienne formulation, pour le staging) ;
- écran Checklist introuvable sur le Cockpit (1) — préexistant (be5f1fe) ;
- connexion refusée (1) et premier chargement trop lent (1).

Passages suivants :

- `candidate-company-ui` : **vert**.
- `multi-tenant-isolation` : **vert** une fois la fenêtre de limitation écoulée. Les échecs de
  connexion venaient bien de la limite de tentatives (10 / 60 s, partagée avec les inscriptions du
  seed) — et ont révélé le défaut de message de connexion corrigé en W6 (voir ci-dessus).
- `cockpit` : les parcours DCE cherchaient le DCE sur la fiche AO alors qu'il a son écran `/dce`
  depuis be5f1fe (spec du 2026-08-03) — navigation corrigée pour ces trois scénarios seulement.
- `checklist-intelligence` : trois dérives préexistantes corrigées dans l'ordre où elles sont
  apparues — écran Checklist dédié (be5f1fe), bouton « Ajouter » ambigu (« Ajouter à la
  bibliothèque » dans la même section ; le formulaire est désormais désigné par son champ), et
  jeu de données : le Tender `tenderWithAnalysisId` du seed e2e n'avait pas d'entreprise candidate,
  exigée par le rapprochement documentaire depuis CCV2-I (e58c4f2). Le seed la lui attribue ;
  `legacyTenderId` reste volontairement sans candidat.

Résultat final :

- `checklist-intelligence` : **2/2 verts** (flux principal complet, isolation multi-tenant).
- `cockpit` : 4/4 hors parcours DCE. Le parcours DCE (4 scénarios en série) reste **rouge pour
  une raison de jeu de données, prouvée à l'écran** : « Initialiser le DCE » est refusé avec
  « Votre organisation n'a pas de droit actif (abonnement, essai ou Pass) pour travailler sur cet
  appel d'offres. » — le contrôle Pass AO (P2.3-E1.3) exige une offre active ou un Pass, et
  l'organisation du seed e2e n'en a volontairement aucune (`billing-subscription.spec` vérifie
  justement « une organisation sans offre active »). Lui donner une offre casserait cette spec.
  **Décision (utilisateur) : organisation dédiée.** Le seed crée une organisation `cockpit`
  abonnée (ENTERPRISE, ACTIVE), avec client, Tender et entreprise candidate ; les 4 scénarios du
  parcours DCE l'utilisent (`fixture.cockpit`), les deux scénarios Cockpit de l'organisation
  principale restent inchangés. Teardown étendu (organisation, utilisateur, abonnement).
  Aucun tsconfig ne couvre `tests/` (Playwright transpile sans vérifier les types) : les fichiers
  e2e modifiés ont été vérifiés par un tsconfig temporaire en mode `strict` — 0 erreur.
  Résultat du dernier passage : l'organisation dédiée lève bien le blocage — « Initialiser le DCE »
  est accepté et le PDF est importé (« cctp-cockpit.pdf — importé »). Le passage complet n'est pas
  vert pour autant : le premier scénario a de nouveau buté sur la limite de connexions
  (infrastructure de test), et les scénarios suivants de la série n'ont pas été rejoués après la
  dernière retouche. **Le parcours DCE complet reste à confirmer.**

  Constat à instruire (non corrigé) : après l'import d'un fichier sur l'écran DCE, la **liste des
  documents ne se rafraîchit pas** — seul le compte rendu d'import affiche le fichier. L'assertion
  d'origine (sous-chaîne) passe sur ce compte rendu et ne vérifie donc pas la liste ; une version
  plus stricte essayée pendant ce chantier l'a révélé, puis a été retirée pour ne pas changer le
  sens du test sans décision.

### Dette préexistante signalée (non corrigée)

- `apps/api/prisma/e2e-seed.ts` ne compile pas en TypeScript strict : 3 appels de création
  d'utilisateur (lignes 38, 105, 155) omettent `termsVersion`, devenu obligatoire. Invisible au
  typecheck de l'API, dont la configuration ne couvre que `src/**` ; le seed s'exécute via `tsx`,
  qui ne vérifie pas les types. La ligne modifiée ici (candidat de `tenderWithAnalysisId`) ne
  produit aucune erreur.

## Périmètre du diff

`git diff HEAD` : 139 fichiers suivis modifiés (+3048 / −884), plus 11 fichiers nouveaux :
`components/ui/file-input.tsx` (+ test), `components/ui/search-select.tsx` (+ test),
`lib/api-error-messages.ts` (+ test unitaire, + test de contrat), `lib/login-error.ts` (+ test),
`lib/version-status.ts`, et ce rapport. Artefacts e2e (`tests/.e2e-fixture.json`,
`test-results/`) ignorés par git ; la spec de diagnostic temporaire W4 a été supprimée.

## Reste à faire / points signalés

- Échec d'un import ZIP : l'écran affiche un message français générique, car le job ne stocke que
  le message technique. Afficher la cause précise demande une colonne `error_code` (migration
  additive) — hors périmètre, à décider.
- Plusieurs fichiers ont été reformatés selon la configuration Prettier du dépôt, ce qui gonfle
  certains diffs sans changer le comportement.
