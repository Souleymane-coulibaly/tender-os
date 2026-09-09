# Migration de la fiche « appel d'offres » vers le design system

**Branche** : `v2.1-final-tnr-api-build-et-h3b-responsive` · **HEAD** : `ca9d842` · travaux non
commités.

**Origine** : constat utilisateur — « j'ai toujours l'ancien IHM dans l'écran appel d'offres ». Après
correction du débordement (H.3-b), la remarque persistait : « il est toujours là ». Le sujet n'était
pas la mise en page, mais **l'apparence**.

---

## 1. Le constat, vérifié avant d'agir

L'application possède un design system complet — `Card`, `Button`, `Input`, `Select`, `Textarea`,
`Badge`, `Alert`, `Checkbox`, les jetons `tenderos-*` et les jetons sémantiques
`success/warning/danger/info` — introduit au **Sprint 25F « homogénéisation UX/UI »** puis étendu par
les **Checkpoints Design System A, B et C**.

La fiche appel d'offres n'y était **jamais passée** : sur 91 fichiers, seuls 6 importaient
`components/ui`. Sur la même grille, `GoNoGoSection` était une carte arrondie navy tandis que *Lots*,
*Critères*, *Pièces demandées*, *Documents*, *Échéances*, *Risques* et *Alertes* étaient des
`<section>` nues avec des champs `border-neutral-300`. C'est cette cohabitation que l'utilisateur
voyait.

---

## 2. Ce qui a été fait

| Mesure | Avant | Après |
| --- | ---: | ---: |
| Fichiers de la fiche important `components/ui` | **6** | **61** / 91 |
| Classes brutes `neutral-*` | **~800** | **0** |
| Palette Tailwind brute (badges/statuts) | 108 | **0** |
| `<Card>` · `<Button>` · `<Input>` · `<Select>` | 6 · 41 · 15 · 3 | **24 · 209 · 98 · 48** |
| Helpers `*BadgeClass()` locaux convertis en tons | — | **8** |

Ne subsistent que les fonds `-50` et bordures `-200/-300` des panneaux d'alerte : le design system
les emploie **lui-même** (`ALERT_TONE_CONFIG` : `border-green-200 bg-success-bg`). Les aligner
aurait créé un écart avec la source, pas l'inverse.

### Convergence des badges

Huit fonctions `*BadgeClass()` reproduisaient à la main la palette de `Badge` — 4 locales, 4 dans
`lib/` (`cockpit-types`, `deliverable-types`). Elles renvoient désormais un **ton sémantique**. La
configuration Tailwind annonçait explicitement cette convergence ; l'exécuter supprime la duplication
plutôt que d'en ajouter une couche.

Les jetons valent **exactement** les couleurs remplacées (`--success-bg` = green-100,
`--danger-fg` = red-800…) : la substitution est visuellement neutre. **Une seule exception, assumée**
: `info` vaut `tenderos-blue/10` et non `blue-100`. Conserver `blue-100` aurait laissé deux bleus
différents sur le même écran — précisément l'incohérence que ce travail supprime.

Deux nuances sans jeton propre — `HIGH` en `orange-100`, `INCONSISTENT` en `orange-100` — rejoignent
`warning`. La distinction reste lisible par le **libellé**, que `Badge` rend obligatoire ; jamais par
la couleur seule.

---

## 3. Méthode

16 fichiers migrés à la main (ceux de l'écran visible, où la structure JSX change réellement :
`<section>` + `<h2>` → `<Card title>`), 26 par transformation scriptée puis relus.

### Trois pièges rencontrés, chacun corrigé avant de continuer

1. **Découpage JSX par expression régulière.** `<button[^>]*>` coupe la balise au premier `>`
   rencontré — y compris celui de `onClick={() => …}`. Premier essai : fichiers invalides. Restauré,
   puis remplacé par un balayage suivant la profondeur des accolades et l'état des chaînes.
2. **Classes de placement emportées.** Une variante de `Button` reprend l'apparence, pas le
   placement. Supprimer tout le `className` faisait disparaître `self-start`, `w-fit`, `ml-2` —
   **22 occurrences**, soit 22 boutons déplacés. Rejoué avec une liste blanche de classes de mise en
   page.
3. **`type` implicite.** Un `<button>` sans `type` vaut `submit` dans un formulaire ; `Button`
   impose `type="button"`. Une conversion silencieuse aurait rendu inertes des boutons de
   soumission. Vérifié après coup : **28** boutons de soumission ont conservé leur `type="submit"`
   explicite, et les 3 seuls `<Button>` sans `type` de l'écran sont dans des fichiers **non
   modifiés** — préexistants, et pilotés par `onClick`.

### Un détail de cascade

`fieldControlClasses` impose `w-full` à tous les contrôles, et Tailwind émet `.w-full` **après**
`.w-20` : une largeur fixe passée à `<Input>` serait silencieusement écrasée. Les champs étroits sont
donc bornés par la **base flex** (`basis-24`, `grow-0`, `shrink-0`), qui prime sur `width` pour un
élément flex — jamais par un `!important`.

Autre écueil : `Select` sans `label` rend le contrôle nu et **n'applique pas** `wrapperClassName`.
Une largeur passée par cette prop serait perdue sans erreur ; elle est portée par un conteneur
explicite.

---

## 4. Vérifications

| Gate | Résultat |
| --- | --- |
| `WEB_TYPECHECK` | ✅ **0** |
| `WEB_LINT` | ✅ **0 erreur** (1 avertissement préexistant, `<img>` dans `app-shell.tsx`) |
| `WEB_BUILD` | ✅ exit **0**, 110 s |
| `tests/h3b-tender-column-overflow.spec.ts` | ✅ **3/3** — 0 débordement, 0 contrôle recouvert à 1024 / 1280 / 1512 px |
| `tests/h3-responsive-1024.spec.ts` | ✅ **6/6** |

Vérification visuelle sur navigateur réel : onglet « Vue d'ensemble » et onglet « Workspace »
(migré par script) rendus et capturés.

**Une remarque de méthode.** Une première exécution conjointe des deux suites a montré 4 échecs.
Ce n'étaient pas des régressions : des `TimeoutError` sur `waitForURL` à la connexion, signature du
throttler d'authentification déjà documenté (bucket partagé 10 requêtes / 60 s). Rejouée seule après
la fenêtre, la suite H.3 passe **6/6**. Je le consigne plutôt que de présenter un vert obtenu en
relançant sans explication.

Contraintes respectées : `DIAGNOSTIC_OWNED_PROCESS_LEAK_COUNT` = **0**, serveur Playwright
préexistant (PID 11220) préservé. **Aucune** modification API, Prisma ou migration.

---

## 5. Limites, énoncées plutôt que tues

- **`checklist-section`, `dce-section`, `go-no-go-section`** n'étaient pas dans le périmètre : ils
  utilisaient déjà les jetons via une constante `INPUT_CLASS` locale. Visuellement cohérents, mais
  ils n'appellent toujours pas `Input`/`Button`. **40 balises HTML brutes** subsistent là, plus les
  cases à cocher volontairement laissées.
- **`EmptyState` n'a pas été adopté** pour les « Aucun lot. » : c'est un bloc `py-12`, disproportionné
  dans huit petites cartes côte à côte. Un paragraphe simple a été conservé — choix de composition,
  pas oubli.
- **Le reste de `/app`** (hors fiche appel d'offres) conserve **188** références `*BadgeClass` : la
  même dette, sur d'autres écrans, hors périmètre de ce travail.
- La couverture par test porte sur la **mise en page** (débordement, atteignabilité), pas sur
  l'apparence : aucun test de régression visuelle n'existe dans ce dépôt.

---

`FILES_MODIFIED` = **45** (43 `.tsx` de la fiche + `lib/cockpit-types.ts` + `lib/deliverable-types.ts`)
· `FILES_CREATED` = **1** (ce rapport) · `FILES_DELETED` = **0**.
