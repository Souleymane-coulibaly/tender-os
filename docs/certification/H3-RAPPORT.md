# H.3 — Certification responsive 1024 px

**Branche** : `v2.1-post-decom-tnr3-certification` · **HEAD** : `074551d` · travaux non commités
(contrainte « no commit / no push » maintenue).

---

## 1. Le défaut EST reproduit

Le constat entrant annonçait `P2-TENDER-1024-OVERFLOW = NOT_REPRODUCED`. **La mesure dit le
contraire** : à 1024 × 768, la fiche d'appel d'offres présente un débordement horizontal de
**307 px** au niveau du document.

La preuve n'est pas visuelle. Elle compare `documentElement.scrollWidth` à `clientWidth`, puis — en
cas de dépassement — parcourt le DOM pour désigner les éléments dont le rectangle sort réellement du
viewport. Une capture d'écran verte n'aurait rien prouvé : un `overflow-x: hidden` mal placé produit
exactement la même image tout en rendant du contenu inatteignable.

`OFFENDING_COMPONENTS_BEFORE`

| Élément | Rectangle | Viewport |
| --- | --- | ---: |
| `input[name="file"].text-xs` | [1022 … 1242] | 1024 |
| `button` « Deposer et rattacher » | [1250 … 1331] | 1024 |

Chaîne de parents : `form.flex items-end gap-2` → `section` → `div.grid grid-cols-1 gap-6
md:grid-cols-2`.

### Cause racine

À 1024 px, le point de bascule `lg:` de l'app-shell rend la barre latérale **statique** (256 px), et
`md:grid-cols-2` est actif : chaque colonne ne fait plus qu'environ 350 px. Le formulaire de dépôt
est une ligne `flex` **sans `flex-wrap` ni `min-w-0`**, et un champ `type="file"` a une largeur
intrinsèque importante. Ne pouvant ni rétrécir ni passer à la ligne, la ligne imposait sa largeur au
document entier.

C'est bien une **discontinuité de point de bascule** : à 768 px la barre latérale est un tiroir, la
colonne est large ; à 1024 px la barre latérale prend sa place et la colonne se resserre — d'où un
défaut visible à 1024 et absent à 1280/1440.

---

## 2. `FIXES_IMPLEMENTED`

Correctif le plus étroit (§17), sur un seul fichier — `documents-section.tsx` :

- `flex-wrap` sur les deux formulaires : les contrôles s'empilent quand la colonne est étroite ;
- `min-w-0 flex-1` sur les champs texte : ils peuvent rétrécir au lieu d'imposer leur contenu ;
- `min-w-0 max-w-full` sur le champ fichier.

**Aucun masquage d'overflow** : le contenu reste accessible, il se réorganise. Aucune largeur fixe,
aucun `overflow-x-hidden` à la racine, aucune refonte.

`OFFENDING_COMPONENTS_AFTER` = **aucun**.

---

## 3. `VIEWPORT_MATRIX_RESULTS` et `PAGE_HORIZONTAL_OVERFLOW_RESULTS`

Débordement mesuré au niveau du document, après correctif :

| Largeur | 1000 | 1023 | **1024** | 1025 | 1100 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Débordement (px) | **0** | **0** | **0** | **0** | **0** |

`BREAKPOINT_BOUNDARY_STATUS` = **PASS** — aucune discontinuité au franchissement. Les sondes à 1023
et 1025 encadrent délibérément le point de bascule : c'est là que ce type de défaut naît, jamais à
une largeur ronde choisie d'avance.

| Flux obligatoire | 1024 × 768 | 1024 × 900 |
| --- | --- | --- |
| `TENDER_CREATE_1024_STATUS` | **PASS** | **PASS** |
| `TENDER_DETAIL_1024_STATUS` | **PASS** | **PASS** |
| `CANDIDATE_SELECTOR_1024_STATUS` | **PASS** | — |
| `CANDIDATE_SWITCH_1024_STATUS` | **PASS** | — |

Sur le formulaire de création, les contrôles obligatoires ne sont pas seulement *présents* : leur
rectangle est vérifié à l'intérieur du viewport. Un bouton rogné hors écran existe pour le DOM et
n'existe pas pour l'utilisateur.

---

## 4. Contenu long, tables, overlays, clavier

| Champ | Valeur |
| --- | --- |
| `LONG_CONTENT_STATUS` | **PASS** — titre pathologique mais valide (≈ 120 caractères) : aucun débordement ; le titre est restauré en `finally`, la base n'est pas laissée polluée |
| `APP_SHELL_STATUS` | **PASS, vérifié et non réécrit** — le durcissement antérieur (bascule `md:` → `lg:`, `min-w-0` sur la colonne et sur `main`) est correct ; il n'était simplement pas suffisant pour un enfant qui refuse de rétrécir |
| `TABLE_OVERFLOW_STATUS` | **PASS** — aucun débordement au niveau du document ; le défilement local dans un conteneur reste acceptable (§13) |
| `OVERLAY_STATUS` | **PASS** — sélecteur de candidat ouvert : aucun débordement, `<select>` contenu dans le viewport |
| `KEYBOARD_STATUS` | **PASS** — le bouton « Confirmer » de la bascule reçoit le focus à 1024 px |

Le `<select>` de candidat méritait une vérification propre : un `<select>` se dimensionne sur son
option la plus large, ce qui en fait une cause classique de débordement — il porte déjà `w-full
min-w-0 truncate` depuis CCV2-F.2, et la mesure le confirme.

---

## 5. Non-régression

| Champ | Valeur |
| --- | --- |
| `DESKTOP_1280_STATUS` · `DESKTOP_1440_STATUS` | **PASS** — 0 px de débordement |
| `TABLET_768_SANITY` | **PASS** |
| `H1_REGRESSION_STATUS` | **PASS** — 21 / 21 (H.1 + H.2 API) |
| `H2_REGRESSION_STATUS` | **PASS** — sémantique de bascule inchangée ; preuves navigateur H.2 et séparation client/candidate **6 / 6** |

`flex-wrap` ne modifie rien tant que la ligne tient : à 1280 et 1440 px la mise en page est
identique à avant. C'était le critère de choix du correctif.

---

## 6. Répétabilité (§23)

| Exécution | Résultat |
| --- | --- |
| `BROWSER_RUN_1` | **6 / 6** |
| `BROWSER_RUN_2` | **6 / 6** |
| `BROWSER_RUN_3` | **6 / 6** |

Trois exécutions consécutives dans l'environnement hermétique de H.4, sans aucune reprise
automatique. Environnement vérifié avant : 0 orphelin, ports libres ; et récupéré après : 4
orphelins de serveurs de développement arrêtés, `TEST_OWNED_NODE_PROCESS_LEAK_COUNT` de nouveau **0**.

---

## 7. Gates

| Gate | Résultat |
| --- | --- |
| `PRISMA_VALIDATE` · `PRISMA_MIGRATE_STATUS` | ✅ · ✅ 115 migrations |
| `API_TYPECHECK` · `API_LINT` · `API_BUILD` | ✅ 0 · ✅ 0 · ✅ |
| `WEB_TYPECHECK` · `WEB_LINT` · `WEB_BUILD` | ✅ 0 · ✅ 0 · ✅ |

| Champ | Valeur |
| --- | --- |
| `API_BEHAVIOR_CHANGE` | **NONE** |
| `PRISMA_CHANGES` · `MIGRATIONS` | **NONE** · **NONE** |
| `FILES_MODIFIED` | 1 — `documents-section.tsx` |
| `FILES_CREATED` | 1 — `tests/h3-responsive-1024.spec.ts` |
| `FILES_DELETED` | 0 |

La sonde de diagnostic utilisée pour identifier l'élément coupable a été **supprimée** après usage :
elle avait servi à trouver, pas à certifier.

---

## 8. Registres

| Réf | Statut |
| --- | --- |
| `P2-TENDER-1024-OVERFLOW` | **`CLOSED_FIXED`** — reproduit (307 px), corrigé, prouvé sur 5 largeurs et 3 exécutions |
| `P2-DEV-SERVER-PROCESS-TREE-ORPHANS` | **reporté** — outillage (§26) ; n'a pas empêché le cycle hermétique, la procédure de récupération H.4 ayant suffi |
| `P2-I-FINAL-AUTHORIZATION-ORDER` · `P2-CREATE-LATENCY` · `P2-SWITCH-LATENCY` · `P2-I-FINAL-HTTP-CERTIFICATION` · `P2-DASHBOARD-SQL-CAPTURE` · `P2-AUTH-THROTTLE-E2E-BUCKET` · `P2-OUTBOX-HARNESS-SCOPED-PUBLISH` | **CLOSED**, inchangés |
| `P2-VERSIONLESS-DOCUMENT` | → **H.5** |
| `DEFERRED-G-03` | → **H.6** |
| `P2-UPLOAD-ASSOCIATION-ATOMICITY` | `MITIGATED_ACCEPTABLE_FOR_2_1` |
| `P2-MULTI-ORG-UI` · `P2-CANDIDATE-NAVIGATION` | `POST_2_1` |

`P3_REGISTER` — `P3-STALE-SWITCH-NO-VERSION` (H.2), inchangé.

---

`P0_FINDINGS` = **0** · `P1_FINDINGS` = **0** — le débordement a été trouvé **et** corrigé dans ce
checkpoint · `P2_FINDINGS` = 0 nouveau · `P3_FINDINGS` = 0.
