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
