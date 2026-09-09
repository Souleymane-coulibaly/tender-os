# FINAL TNR — Blocage `API_BUILD` : cause racine et correctif borné

**Branche** : `v2.1-ccv2-i-decommissionnement-et-hardening-h1-h6` · **HEAD** : `e58c4f2` · travaux
non commités (contrainte « no commit / no push » maintenue).

---

## 1. Le build n'était pas bloqué — il était lent et muet

`API_BUILD_CLASSIFICATION` = **`BUILD_CONFIGURATION`**, mécanisme **A : compilation active mais
extrêmement lente**, jamais un blocage.

Reproduit une fois, en mesurant plutôt qu'en supposant :

| Observation | Valeur |
| --- | --- |
| Sortie du processus | exit **0**, terminaison **naturelle** |
| Durée | **224 s** (3 min 44 s) |
| Arbre de processus | `pnpm` → `pnpm exe` → `nest build` (PID 18620) |
| Émission dans `dist` pendant l'exécution | **active** — 5 829 fichiers produits |
| Bootstrap applicatif | **aucun** — pas de PostgreSQL, pas de worker Outbox, pas de serveur HTTP |

Le processus tué par la TNR (PID 24568) **aurait abouti**. `nest build` n'écrit strictement rien
entre sa bannière et sa fin : pendant près de quatre minutes, un observateur — humain ou automate —
ne peut pas distinguer cette attente d'un blocage. C'est cette absence de signal, et non un
verrouillage, qui a produit le `NOT_TERMINAL`.

*Note de méthode : un échantillon intermédiaire a montré `dist` à 0 fichier, ce qui pouvait faire
croire à une absence d'émission. C'était l'instant transitoire du `deleteOutDir` de Nest. Je l'ai
vérifié plutôt que d'en tirer une conclusion.*

---

## 2. `API_BUILD_ROOT_CAUSE`

**`apps/api/tsconfig.build.json` n'existait pas.**

Nest CLI cherche ce fichier par convention et, à défaut, se rabat sur `tsconfig.json` — dont
`include` vaut `src/**/*.ts`, sans aucune exclusion des tests.

| Métrique | Valeur |
| --- | ---: |
| Fichiers source de production | 2 219 |
| **Fichiers de test compilés dans le livrable** | **695** |
| Fichiers émis dans `dist` | 5 829 |
| Poids du livrable | 36 Mo |

Le paquet déployable contenait donc **l'intégralité de la suite de tests** — specs d'intégration,
doublures, fixtures et leurs valeurs sentinelles. Le temps de compilation n'était que le symptôme le
plus visible ; le défaut de fond est qu'un artefact de production embarquait du code de test.

| Champ | Valeur |
| --- | --- |
| `API_BUILD_SCRIPT` | `nest build` — aucun `prebuild`/`postbuild` ; seul `postinstall` exécute `prisma generate`, hors périmètre du build |
| `BUILD_FILESET_STATUS` | **trop large** — `src/**/*.ts` sans exclusion ; aucune traversée parasite de la racine, de `apps/web`, de `node_modules`, des artefacts Playwright ou `mvno-*` |
| `TYPECHECK_VS_NEST_BUILD_DIFFERENCE` | `tsc --noEmit` **n'émet rien** : il type-checke les 2 914 fichiers en mémoire et rend la main. `nest build` **efface `dist`** puis **émet** ~5 829 fichiers (JS + source maps) sur disque. Même ensemble de fichiers, coût d'écriture radicalement différent — d'où un gate qui aboutit et un autre qui paraît figé |
| `BUILD_PARENT_PID` / `BUILD_CHILD_PROCESS_SUMMARY` | 36856 (pnpm) → 14716 (pnpm exe) → **18620** (`nest build`) ; aucun sous-processus `tsc` distinct, Nest compile en interne |
| `BUILD_RESOURCE_ACTIVITY` | **ACTIVE** — émission mesurée en progression, mémoire ~50 Mo, aucune attente sur descripteur |
| `BUILD_EMISSION_STATUS` | **fichiers réellement créés** pendant l'exécution, jusqu'à `dist/main.js` |

---

## 3. `FIX_REQUIRED` = **oui** · `FIX_DESCRIPTION`

Création de `apps/api/tsconfig.build.json` — le fichier que la convention NestJS attend et qui
manquait :

```json
{ "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "src/**/test-support/**"] }
```

Ce correctif figure explicitement parmi ceux autorisés (§20 : « correct tsconfig include/exclude »).

**Ce qui n'a PAS été fait**, et qui aurait été plus rapide : augmenter un délai, relancer à l'aveugle,
remplacer le build par le typecheck, ajouter un `|| true`, ou exclure du code légitime pour verdir un
gate. Aucun contrôle du compilateur n'a été désactivé.

**`tsconfig.json` est inchangé** : `tsc --noEmit -p tsconfig.json` continue de type-checker les 695
fichiers de test. Seule la **compilation du livrable** est restreinte — la couverture de types ne
perd rien.

Vérification préalable à l'exclusion de `test-support` : **aucun** fichier de production ne
l'importe. L'exclusion ne peut donc casser aucun chemin d'exécution.

---

## 4. `COUNTER-PROOF` (§21)

| Mesure | Avant | Après |
| --- | ---: | ---: |
| Durée | **224 s** | **117 s** |
| Fichiers émis | 5 829 | 4 353 |
| **Tests dans le livrable** | **695** | **0** |
| Poids | 36 Mo | 23 Mo |

La configuration d'origine reproduit le comportement signalé ; la configuration corrigée le supprime.
Ce n'est pas « c'est passé après avoir édité » : les deux états ont été mesurés.

---

## 5. Répétabilité (§22)

Trois exécutions consécutives depuis un état contrôlé, **sans aucune interruption forcée ni reprise
automatique** :

| Exécution | Code de sortie | Durée | `dist/main.js` | Tests dans `dist` |
| --- | --- | ---: | --- | ---: |
| `API_BUILD_RUN_1` | **0** | **117 s** | présent | 0 |
| `API_BUILD_RUN_2` | **0** | **110 s** | présent | 0 |
| `API_BUILD_RUN_3` | **0** | **109 s** | présent | 0 |

Chacune se termine **naturellement**.

---

## 6. Gates et régression

| Gate | Résultat |
| --- | --- |
| `API_TYPECHECK` | ✅ **0** |
| `API_LINT` | ✅ **0** |
| `API_BUILD` | ✅ **3 / 3**, exit 0 |

`WEB_TYPECHECK` / `WEB_LINT` / `WEB_BUILD` : **non requis**, et je le justifie plutôt que de le
passer sous silence. Le §24 ne les impose que si une configuration **partagée** est touchée. Ici
l'unique fichier ajouté est `apps/api/tsconfig.build.json` : nouveau, local à l'API, lu par le seul
Nest CLI. `apps/web` possède ses propres `tsconfig` et build, qu'aucune modification n'atteint.

`H1` à `H6` **ne sont pas rejoués** (§25) : le correctif ne change que la configuration de
compilation, aucune sémantique d'exécution. Aucun fichier source, aucun bootstrap, aucune règle
métier n'a été modifié.

En contrepartie, une vérification que la seule configuration ne donne pas : le livrable produit a été
**démarré** et répond sur `/health`. C'est la preuve directe qu'exclure les tests n'a rien retiré au
chemin d'exécution.

| Champ | Valeur |
| --- | --- |
| `DIAGNOSTIC_OWNED_PROCESS_LEAK_COUNT` | **0** |
| `FILES_CREATED` | **1** — `apps/api/tsconfig.build.json` (+ ce rapport) |
| `FILES_MODIFIED` · `FILES_DELETED` | **0** · **0** |
| `PRISMA_CHANGES` · `MIGRATIONS` | **NONE** · **NONE** |

Nettoyage enregistré (§8) : seul `dist/`, sortie de build jetable régénérée à chaque exécution par
le `deleteOutDir` de Nest lui-même. **Aucun fichier source supprimé.**

Processus préexistants du 06/09 (`node dist/main.js`, `next start -p 3220`) : **jamais touchés**.

---

## 7. Preuves TNR préservées (§27)

Rien de ce qui suit n'est invalidé par ce correctif — il ne modifie aucun comportement d'exécution :

migrations **115/115** · seed système **PASS** · H1 **12/12** · H2/H5/H4-dashboard **32/32** ·
H6 **20/20** · atomicité H2 **PASS** · latence H2 **PASS** · intégrité H5 **PASS** · DC1/DC2/DC4
**PASS**.

La TNR suivante doit **reprendre les gates restants**, pas repartir de zéro.

---

`P0_FINDINGS` = **0** · `P1_FINDINGS` = **0** · `P2_FINDINGS` = **1** — le livrable de production
contenait 695 fichiers de test ; corrigé ici · `P3_FINDINGS` = **0**.

**VERDICT = `API_BUILD_BLOCKER_CLOSED`** · `NEXT_ACTION = RESUME_FINAL_TNR_FROM_REMAINING_GATES`
