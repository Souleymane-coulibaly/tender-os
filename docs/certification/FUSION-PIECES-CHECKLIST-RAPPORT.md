# Fusion des « Pièces demandées » dans la Checklist

**Branche** : `v2.1-design-system-fiche-appel-offres` · **HEAD** : `b29d94c` · travaux non commités.

**Décision utilisateur** : fusionner (option 1). Paramètres validés avant tout code : checklist à
**60 points** ; pièce PROVIDED reprise en **READY** ; ancienne table **conservée, plus écrite** ;
suggestions héritées **redirigées vers la checklist**.

---

## 1. Pourquoi

Depuis le V2 Sprint 6, l'analyse IA n'alimente plus `tender_requested_documents` : les exigences
du DCE deviennent des éléments de checklist (`finding-to-suggestion-mapper.ts`, « CHANGEMENT DE
RESPONSABILITÉ »). La table continuait pourtant de peser **25 points sur 100** du score de
préparation et d'alimenter le GO/NO-GO. Il y avait deux mécanismes de suivi des pièces pour une
seule réalité, et un quart du score reposait sur une liste que plus rien ne remplissait
automatiquement.

La checklist couvrait déjà toutes les fonctions des pièces : créer, rattacher ou détacher un
document, rapprochement IA, valider, marquer non applicable, créer une tâche (13 actions web,
12 routes). **Aucune fonction perdue.**

---

## 2. Migration `20261018090000_merge_requested_documents_into_checklist`

Additive : aucune ancienne migration modifiée, **aucune ligne source modifiée ni supprimée**. Une
table d'audit, `tender_requested_document_checklist_migrations`, conserve une ligne par pièce
reprise (`CREATED` ou `LINKED_EXISTING`, avec une note).

Chaque règle reproduit le domaine Checklist (`attachDocument`, `deriveLegacyStatus`), sans
sémantique inventée pour l'occasion. Deux points méritent d'être signalés :

- **PROVIDED sans document → TO_REVIEW, pas READY.** Dans la checklist, READY signifie « un
  document est là, reste à le valider ». C'est l'application stricte du choix validé : une pièce
  marquée fournie mais sans document ne peut pas devenir READY sans mentir. Une note le signale.
- **`origin` = MANUAL, délibérément.** La réconciliation marque périmé tout élément
  `origin ≠ MANUAL` absent de la dernière analyse. Des pièces saisies à la main deviendraient
  périmées dès l'analyse suivante.

Autres règles :

- Document sans version courante (donnée héritée, voir H.5) : non rattaché, et noté.
- Auteur d'une validation : `NULL`, jamais inventé.
- Métadonnées sans colonne équivalente (catégorie, format, signature, modèle acheteur,
  expiration) : reportées dans la description.
- Doublon de même titre exact : relié à l'élément existant, jamais revalidé. Son document n'est
  repris que si l'élément est encore intact.

### Preuve

Base jetable peuplée de **16 cas** couvrant chaque statut, les documents avec et sans version,
un document expiré, les métadonnées, un lot et quatre configurations de doublon.

| Contrôle | Résultat |
| --- | --- |
| 116 migrations sur base vierge | ✅ |
| 16 cas | ✅ 11 créés, 5 reliés, chaque attente écrite avant exécution |
| Table source | ✅ **empreinte md5 identique** avant et après |
| Seconde exécution | ✅ aucune double création, source toujours intacte |
| Dérive Prisma sur la nouvelle table | ✅ **0** |
| Rejeu complet depuis zéro | ✅ |
| Base de développement | ✅ appliquée (0 pièce à reprendre) |

### Défauts trouvés dans mon propre travail, et corrigés

1. **Noms d'index trop longs.** Deux noms de 76 et 68 caractères dépassaient la limite de 63 de
   PostgreSQL, qui les tronque sans avertir, et pas comme Prisma. Résultat : une dérive sur la
   nouvelle table. Remplacés par les noms que Prisma génère.
2. **Report de document sur un doublon.** Je numérotais toutes les pièces en double ensemble. Une
   pièce sans document, créée en premier, « gagnait » et privait l'élément du document d'une
   pièce suivante. La numérotation porte désormais sur les seules pièces qui ont un document. Le
   cas a été ajouté à la preuve (C15/C16).
3. **Protocole de preuve.** Une passe a regroupé plusieurs `DROP DATABASE` en une seule
   exécution. PostgreSQL les refuse dans une transaction, et la sortie était masquée : le contrôle
   de dérive et le rejeu de cette passe avaient tourné sur l'ancien état. Refait avec une
   instruction par exécution, sortie visible, et une empreinte md5 à la place d'un contrôle
   `updatedAt`/`createdAt` qui était faux.

---

## 3. Ce qui lit la checklist à la place

| Consommateur | Avant | Après |
| --- | --- | --- |
| Score de préparation | checklist 35 + pièces 25 | **checklist 60**, total toujours 100 |
| GO/NO-GO | pièces demandées | éléments **documentaires** de la checklist |
| Complétude | « Pièces demandées » | « Checklist » |
| Assistant IA | section « Documents demandés » | retirée : la section Checklist les couvre déjà |
| Tableau, liste, statistiques | via le score | via le score |

**GO/NO-GO.** Seuls comptent les types qui désignent une pièce : documents administratifs,
techniques et financiers, certification, assurance, déclaration, formulaire, signature. Une
visite, une échéance ou une exigence technique fausseraient la « complétude documentaire ».
« Fournie » = READY ou VALIDATED, soit exactement PROVIDED / VALIDATED d'avant. « Éliminatoire »
= BLOCKING. Un élément NOT_APPLICABLE est exclu. Les signaux n'étant **pas persistés** dans les
rapports, les rapports existants se relisent sans changement.

**Suggestions héritées** `TENDER_REQUESTED_DOCUMENT` : les accepter crée un élément de checklist
(`origin` AI_SUGGESTION). Une suggestion de *mise à jour* est refusée avec un message explicite :
aucune n'a jamais été produite.

**Retiré** : 5 routes API, 8 fichiers de code applicatif, la section et l'action web.

---

## 4. Gates

| Gate | Résultat |
| --- | --- |
| `API_TYPECHECK` (inclut toutes les specs) | ✅ 0 |
| `API_LINT` · `WEB_TYPECHECK` · `WEB_LINT` | ✅ 0 · 0 · 0 erreur |
| `WEB_BUILD` | ✅ exit 0 |
| Tests unitaires ciblés (score, complétude, profil, tableau, liste, stats, GO/NO-GO, analyse, chat, adaptateur) | ✅ **311/311** |
| Nouveaux tests : signaux documentaires (6), redirection des suggestions (4) | ✅ |
| Specs d'intégration sur base migrée (8 fichiers) | ✅ **69/69** |
| H.3-b · H.3 · rendu de la fiche | ✅ 3/3 · 6/6 · 1/1 |

Au premier passage, 6 tests unitaires ont échoué pour une seule cause. La spec de l'assistant
construisait l'assembleur avec un argument positionnel de trop, un faux dépôt que ma recherche
n'avait pas trouvé parce que sa variable ne contenait pas « RequestedDocument ». Tous les
arguments suivants étaient décalés. Corrigé, puis rejoué.

Les `ECONNREFUSED` du build web viennent de la génération statique qui tente de joindre l'API
arrêtée. Ils sont **préexistants** : 3 dans chacun des builds du 09/09.

---

## 5. Limites et risques résiduels

- **Les scores bougent** : pondération, et pièces PROVIDED à revalider. C'est voulu, mais visible
  pour les utilisateurs.
- **Rapports GO/NO-GO** : les instantanés déjà générés ne changent pas. Un rapport d'avant et un
  rapport d'après ne se comparent pas terme à terme.
- **Clients externes de l'API** : aucun module interne n'appelait les 5 routes retirées. Un
  appelant extérieur ne peut pas être exclu.
- **Suggestion héritée acceptée** : son `entityId` désigne l'élément de checklist créé, alors que
  son `entityType` reste `TENDER_REQUESTED_DOCUMENT`. La lecture croisée « quelle suggestion a
  créé cet élément ? » ne la retrouvera donc pas par le type. Aucune n'est en attente en local.
- **Ancienne table** conservée : sa suppression attend une décision de conservation explicite,
  dans une migration distincte.
- **Suite unitaire complète** non rejouée. En contrepartie, le typecheck couvre la compilation de
  toutes les specs, et les suites des modules touchés ont été rejouées.

`FILES_MODIFIED` = 42 · `FILES_DELETED` = 9 · `FILES_CREATED` = 5 (migration, signaux
documentaires et leur test, test de l'adaptateur, ce rapport). Diff suivi : +183 / −1586.
