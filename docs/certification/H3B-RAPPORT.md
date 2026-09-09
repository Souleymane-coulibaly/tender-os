# H.3-b — Débordement intra-colonne de la fiche d'appel d'offres

**Branche** : `v2.1-ccv2-i-decommissionnement-et-hardening-h1-h6` · **HEAD** : `e58c4f2` · travaux
non commités (contrainte « no commit / no push » maintenue).

**Origine** : constat utilisateur sur capture d'écran (~1512 px) — le bouton « Ajouter » de *Pièces
demandées* tronqué en « Ajo », recouvert par la colonne *Documents*.

---

## 1. Ce que ce n'était pas

La première hypothèse — un rendu obsolète servi par un serveur resté en vie — est **fausse**, et je
l'ai écartée par la mesure avant de chercher ailleurs. Le bundle construit contenait déjà le
correctif H.3 :

```
form className:"flex flex-wrap items-end gap-2"   ← Documents (dépôt)
form className:"flex flex-wrap items-end gap-2"   ← Documents (rattachement)
input name:"file" className:"min-w-0 max-w-full text-xs"
```

La capture le confirmait d'elle-même : les champs « Titr » / « Cat » y sont écrasés à ~45 px. Sans
`min-w-0`, un `input` refuse de descendre sous sa largeur intrinsèque — ce rétrécissement **est** la
signature du correctif H.3 en action.

---

## 2. `H3B_ROOT_CAUSE`

Sept formulaires de la fiche portaient encore `flex items-end gap-2`, sans `flex-wrap` ni largeur
minimale sur leurs champs. Deux `input` par défaut valent ~270 px chacun ; avec la case à cocher et
le bouton, la ligne réclamait ~769 px dans une piste `md:grid-cols-2` d'environ 730 px.

Les pistes Tailwind `grid-cols-2` valent `repeat(2, minmax(0, 1fr))` : leur largeur est **plafonnée**
et ne s'élargit jamais. Le trop-plein de la colonne de gauche se déversait donc **dans la colonne de
droite**, recouvrant ses contrôles.

### Pourquoi H.3 avait certifié cet écran au vert

C'est le point important de ce constat, et il porte sur la **méthode de preuve**, pas sur le code.

H.3 mesurait `documentElement.scrollWidth` contre `clientWidth`. Cette mesure est structurellement
**aveugle** au défaut ci-dessus : le débordement de la colonne gauche reste *à l'intérieur* du
document, la largeur totale ne change pas, `scrollWidth` ne bouge pas. Le contrôle passait au vert
pendant que le bouton disparaissait sous la section voisine.

Le certificat H.3 n'est pas faux — son périmètre était plus étroit que l'écran qu'il couvrait. Une
mesure au niveau document ne peut pas voir un recouvrement entre colonnes ; il faut une mesure
**locale**, où chaque descendant est comparé au rectangle de **sa** colonne.

---

## 3. Mesure et contre-preuve

Nouvelle sonde : [`tests/h3b-tender-column-overflow.spec.ts`](../../tests/h3b-tender-column-overflow.spec.ts).
Navigateur réel, PostgreSQL réelle, fiche réellement seedée.

| Largeur | Éléments hors de leur colonne — AVANT | APRÈS |
| ---: | ---: | ---: |
| 1024 px (point certifié en H.3) | **8** (jusqu'à **+252 px**) | **0** |
| 1280 px | **3** (jusqu'à +124 px) | **0** |
| 1512 px (largeur de la capture) | **1** (**+8 px**) | **0** |

Contre-preuve conduite avec la sonde **finale** dans les deux états (correctif remisé puis restauré),
afin que l'écart mesure le code et non l'évolution de l'instrument.

Contrôles réellement inatteignables à 1024 px avant correction — `input[required]`,
`button[Ajouter]`, `select[type]` recouverts par les champs de la colonne voisine : **3 → 0**.

---

## 4. Correctif

Motif unique, appliqué aux 9 fichiers :

- ligne : `flex items-end gap-2` → `flex flex-wrap items-end gap-2` ;
- champ texte libre : `min-w-[10rem] flex-1` (secondaire `min-w-[8rem]`) ;
- champs de largeur fixe (`w-16`, `w-20`) : inchangés, déjà bornés ;
- `input[type=file]` de `dce-section` : `min-w-0 max-w-full`.

**Le plancher n'est pas cosmétique.** Le motif H.3 employait `min-w-0`, sans plancher : le
débordement disparaît, mais les champs tombent à ~45 px — largeur où ils ne servent plus à rien. Le
défaut changeait de nature au lieu d'être corrigé. Un plancher explicite fait passer les contrôles
**à la ligne** au lieu de les écraser, ce que `flex-wrap` était précisément là pour permettre. Les
trois champs de `documents-section` certifiés en H.3 sont alignés sur ce plancher pour la même
raison. `min-w-[Npx] flex-1` est déjà le motif en place dans `signature-section` et
`validation-section` — aucune convention nouvelle n'est introduite.

Aucun `overflow: hidden`, aucun masquage : le contenu se réorganise, il ne disparaît pas.

---

## 5. Deux défauts de ma propre mesure, corrigés avant d'en rien conclure

Signalés parce qu'ils ont failli produire deux faux constats :

1. `elementFromPoint` ne raisonne que dans le viewport — sans amener l'élément à l'écran, il renvoie
   `null` pour tout ce qui est sous la ligne de flottaison. Première version : **52** contrôles
   « recouverts par rien ». Corrigé par un défilement préalable.
2. Un `<details>` **replié** ne peint pas son contenu, mais Chromium continue d'en rendre les
   rectangles. Le panneau « modifier » de la fiche produisait ainsi **5** faux recouvrements,
   identiques à toutes les largeurs — l'invariance en largeur était l'indice qu'il ne s'agissait pas
   d'un défaut responsive. Diagnostiqué (`<details>` de 66 px pour un formulaire de 1239 px) puis
   exclu.

---

## 6. Gates

| Gate | Résultat |
| --- | --- |
| `WEB_TYPECHECK` | ✅ **0** |
| `WEB_LINT` | ✅ **0 erreur** (1 avertissement préexistant, `<img>` dans `app-shell.tsx`, hors périmètre) |
| `WEB_BUILD` | ✅ exit **0**, 161 s |
| `tests/h3-responsive-1024.spec.ts` (H.3 d'origine) | ✅ **6/6**, inchangé |
| `tests/h3b-tender-column-overflow.spec.ts` | ✅ **3/3** |

Vérifié dans le CSS de production, après purge Tailwind : `min-width:10rem` et `min-width:8rem` sont
bien émis. Dans le chunk de la fiche : **0** ligne sans `flex-wrap`, **10** avec.

`DIAGNOSTIC_OWNED_PROCESS_LEAK_COUNT` = **0** — serveurs de développement démarrés pour cette mesure
puis récoltés ; le serveur Playwright préexistant (PID 11220, 20:02) préservé intact.

`API` : **aucune modification**. `PRISMA_CHANGES` / `MIGRATIONS` : **NONE**.

---

## 7. Incidence sur la TNR en cours

Ce correctif touche **9 fichiers de `apps/web`** et n'existait pas dans l'arbre au moment du verdict
`API_BUILD_BLOCKER_CLOSED`. Aucun comportement serveur, aucune règle métier, aucun contrat HTTP n'est
modifié : ce sont exclusivement des classes de mise en page.

Les gates web ci-dessus ont donc été rejoués intégralement, ainsi que la suite H.3 d'origine.

`FILES_MODIFIED` = **9** (tous dans `apps/web/src/app/app/(protected)/tenders/[id]/`) ·
`FILES_CREATED` = **2** (la sonde et ce rapport) · `FILES_DELETED` = **0**.
