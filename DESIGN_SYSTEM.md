# DESIGN_SYSTEM.md — le langage graphique de TenderOS

Ce document décrit le design system **tel qu'il existe dans le code** ; il n'invente rien. En cas
d'écart, le code fait foi :

- composants : `apps/web/src/components/ui` (import unique : `components/ui`, le barrel `index.ts`) ;
- jetons : `apps/web/src/app/globals.css` (valeurs) et `apps/web/tailwind.config.ts` (noms Tailwind) ;
- page de référence : la fiche appel d'offres (`app/(protected)/tenders/[id]`).

Garde-fou : `app/(protected)/design-system.contract.test.ts` interdit le retour de l'ancien style
dans les pages déjà migrées.

---

## 1. Couleurs

Aucune couleur en dur (hexadécimal, `style={{ color }}`) et aucune palette Tailwind brute
(`neutral-*`, `gray-*`, `green-100`, `red-700`…) dans les pages : uniquement les jetons ci-dessous.
Seuls les composants de `components/ui` peuvent encore contenir une palette brute, en interne.

### Marque

| Jeton | Valeur | Usage |
|---|---|---|
| `tenderos-navy` | `#0a2a5b` | texte principal, titres, bouton principal, bordures (en opacité : `/10`, `/15`) |
| `tenderos-slate` | `#64748b` | texte secondaire, descriptions, légendes, en-têtes de tableau |
| `tenderos-blue` | `#1472ff` | liens, onglet actif, focus, information |
| `tenderos-light` | `#f8fafc` | fonds discrets, survol, badge neutre |
| `tenderos-gold` / `gold-light` | `#d4af37` / `#f4d47c` | accent de marque (rare) |
| `tenderos-white` | `#ffffff` | fonds de carte |

Bordures : `border-tenderos-navy/10` (cartes, tableaux, séparateurs), `border-tenderos-navy/15`
(champs, boutons secondaires).

### États

| Jeton | Fond | Texte | Usage |
|---|---|---|---|
| `success` | `success-bg` (#dcfce7) | `success-fg` (#166534) | réussi, actif, validé |
| `warning` | `warning-bg` (#fef3c7) | `warning-fg` (#92400e) | à surveiller, partiel |
| `danger` | `danger-bg` (#fee2e2) | `danger-fg` (#991b1b) | erreur, bloquant, destructif |
| `info` | `info-bg` (bleu 10 %) | `info-fg` (`tenderos-blue`) | information, en cours |

### Correspondance depuis l'ancien style

| Ancien | Jeton |
|---|---|
| `text-neutral-700/800/900` | `text-tenderos-navy` |
| `text-neutral-500/600` | `text-tenderos-slate` |
| `text-neutral-400` | `text-tenderos-slate/70` |
| `border-neutral-100/200`, `divide-neutral-*` | `border-tenderos-navy/10`, `divide-tenderos-navy/10` |
| `border-neutral-300` | `border-tenderos-navy/15` |
| `bg-neutral-50/100/200`, `hover:bg-neutral-*` | `bg-tenderos-light`, `hover:bg-tenderos-light` |
| `green/red/amber/blue-100` (fond) | `success-bg` / `danger-bg` / `warning-bg` / `info-bg` |
| `green/red/amber/blue-700/800` (texte) | `success-fg` / `danger-fg` / `warning-fg` / `info-fg` |
| `bg-neutral-900` (bouton) | `<Button variant="primary">` |

---

## 2. Typographie

- Titres : `font-tenderos-display`, jamais posés à la main — ils viennent des composants
  (`PageHeader` : `text-xl sm:text-2xl font-extrabold` ; `Card` et `EmptyState` : `text-base font-bold`).
- Texte courant : `text-sm text-tenderos-navy`. Texte secondaire : `text-sm text-tenderos-slate`.
- Légendes, aides, badges : `text-xs`. Libellés de champ : `text-sm font-medium` (`FieldWrapper`).
- Échelle limitée à `text-xs`, `text-sm`, `text-base` dans les pages ; un sous-titre dans une carte :
  `<h3 className="text-sm font-semibold text-tenderos-navy">`.

## 3. Espacements

- Page : conteneur `flex flex-col gap-4` (ou `gap-6`).
- Carte : `p-5` (`padding="tight"` : `p-4` ; `"none"` pour un tableau pleine largeur).
- Grilles et groupes : `gap-2` à `gap-4`. Pas de marges négatives, pas de hauteurs fixes.

---

## 4. Composants

| Besoin | Composant | Règle |
|---|---|---|
| En-tête de page | `PageHeader` | fil d'Ariane, titre, description, statut, actions — un par page |
| Onglets d'une fiche | `TabsNav` | `activeHref` fourni par la page |
| Onglets d'une section (layout) | `SectionTabs` | onglet actif déduit de l'adresse |
| Bloc de contenu | `Card` | `title`, `description`, `actions` ; jamais une `<section>` bordée à la main |
| Action | `Button` | **un seul `primary` par écran** ; `secondary` par défaut ; `danger` pour détruire ; `link` pour une action textuelle ; `href` pour naviguer |
| Statut | `Badge` | `tone` (`neutral`, `info`, `success`, `warning`, `danger`, `gold`) via une table `STATUT → tone`, jamais des classes de badge écrites à la main |
| Liste tabulaire | `Table`, `TableHead`, `TableRow`, `TableHeaderCell`, `TableBody`, `TableCell` | défilement horizontal intégré |
| Saisie | `Input`, `Select`, `Textarea`, `Checkbox`, `FileInput` | toujours avec `label` |
| Message dans la page | `Alert` | `tone` d'état, titre optionnel |
| Liste vide (page entière) | `EmptyState` | dans une petite carte : `<p className="text-sm text-tenderos-slate">` |
| Retour d'action | `useToast` | |
| Chargement | `Button loading`, `Skeleton`, `CardSkeleton`, `TableSkeleton` | |

## 5. Anatomie des pages

- **Page métier** : `PageHeader` puis le contenu en `Card`.
- **Fiche avec onglets** (appel d'offres) : `PageHeader`, puis `TabsNav`, puis les `Card` de l'onglet.
- **Section de paramètres** (Configuration IA, Intégrations) : le layout rend `PageHeader` et
  `SectionTabs` ; chaque onglet rend seulement des `Card`. Une fiche ou une création commence par
  `<Button variant="link" href="…">← Liste</Button>`.
- **Formulaire** : une `Card` contenant le `<form>` ; bouton d'envoi `type="submit"` explicite.
- **Liste** : `Table` dans la page, ou `EmptyState` si la liste est vide.

## 6. États

- Erreur : `text-danger-fg` avec `role="alert"` (inline), ou `<Alert tone="danger">` (bloc).
  Échec de chargement d'une page : `ApiErrorState`.
- Succès : `text-success-fg` ou `useToast`. Information : `<Alert tone="info">`.
- Désactivé : `disabled` (les composants gèrent l'opacité et le curseur).

## 7. Icônes

- Une seule source : `components/ui/icons.tsx` — grille 16 px, trait `currentColor` (1,4), extrémités
  arrondies ; la couleur suit le texte.
- Décoratives : `aria-hidden="true"` (déjà le cas) ; le nom accessible reste le texte du lien.
- Pas de bibliothèque d'icônes tierce, pas d'émoji dans l'interface.

## 8. Responsive

- `Table` défile horizontalement ; `TabsNav` aussi.
- `PageHeader` passe de colonne à ligne à partir de `sm:`.
- Jamais de largeur fixe sur un champ (`fieldControlClasses` impose `w-full`) : borner par le parent
  (`basis-*` en flex, `max-w-*`, `wrapperClassName`).

## 9. Pièges connus (migration de la fiche appel d'offres)

1. `Button` vaut `type="button"` : un bouton qui soumet un formulaire doit porter `type="submit"`.
2. En convertissant un bouton, garder ses classes de placement (`self-start`, `w-fit`, `ml-*`,
   `flex-1`, `shrink-0`…) : seules les classes visuelles disparaissent.
3. Ne jamais transformer du JSX avec une expression régulière du type `<button[^>]*>` :
   `onClick={() => …}` contient un `>`.
4. Une largeur `w-*` sur `Input` est écrasée par `w-full` : borner par le conteneur.
5. `Select` sans `label` ignore `wrapperClassName` : porter la largeur par un conteneur.
6. Ne jamais passer une fonction d'un composant serveur à un composant client : les listes de
   données (menus, cartes) portent des clés, jamais des composants ou des callbacks.
