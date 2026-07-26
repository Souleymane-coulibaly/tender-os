# Kanban & List Views

## Rôle du module

Le module Kanban & List Views est une **couche de projection et de pilotage en lecture** au-dessus du module **Tenders**. Il ne possède **aucune logique métier autonome** : aucun nouveau statut, aucune nouvelle entité métier, aucune nouvelle règle de transition.

**Le module Tenders reste la source de vérité.** Toute mutation (changement de statut) passe exclusivement par les cas d'usage déjà existants du module Tenders (`ChangeTenderStatusUseCase`, exposé par `POST /api/v1/tenders/:tenderId/status`) — le Kanban ne fait qu'appeler ce même endpoint depuis le glisser-déposer, sans jamais écrire directement en base ni dupliquer la validation des transitions (`ALLOWED_TENDER_TRANSITIONS`).

Ce module n'est **pas** un nouveau module NestJS ni un nouveau bounded context : il est implémenté entièrement à l'intérieur de `apps/api/src/modules/tenders/` (nouveaux use cases, DTOs et routes), avec les mêmes guards, la même isolation multi-tenant et les mêmes permissions que le reste de Tenders.

## Endpoints

Tous exposés par `TendersController` (`apps/api/src/modules/tenders/interfaces/http/tenders.controller.ts`), organisation resolue via le header `X-Organization-Id` (jamais via l'URL) et revalidée par `OrganizationMembershipGuard` :

| Méthode | Route | Use case | Description |
|---|---|---|---|
| GET | `/api/v1/tenders/board` | `GetTenderBoardUseCase` | Colonnes = statuts réels de Tenders (hors `ARCHIVED`), avec total réel par colonne et cartes plafonnées (`limitPerColumn`, défaut 50) |
| GET | `/api/v1/tenders/stats` | `GetTenderStatisticsUseCase` | Statistiques synthétiques agrégées |
| GET | `/api/v1/tenders` | `GetTenderListViewUseCase` | Liste paginée existante, **enrichie** (additif) des indicateurs de pilotage |
| POST | `/api/v1/tenders/:tenderId/status` | `ChangeTenderStatusUseCase` (inchangé) | Réutilisé tel quel par le glisser-déposer du Kanban |

Aucun nouvel endpoint de mutation n'a été créé.

## Filtres disponibles

Portés par `ListTendersQuerySchema` / `TenderBoardQuerySchema` :

- `search` (texte libre — voir « Extensibilité de la recherche » ci-dessous)
- `status`
- `internalOwnerId` (responsable)
- `deadlineAfter` / `deadlineBefore` (fenêtre d'échéance — permet « échéance proche »)
- `overdue=true` (échéance dépassée, hors statuts `SUBMITTED`/`WON`/`LOST`/`ARCHIVED`)
- `sort` (`createdAt` | `submissionDeadline` | `title` | `updatedAt`) / `sortDirection` — vue Liste uniquement

**Non implémenté délibérément** : un filtre serveur sur le "niveau de préparation" (readiness). Le score est calculé à la volée à partir de plusieurs sous-ressources ; en faire un critère de filtrage `WHERE` obligerait à le calculer pour un ensemble non borné de Tenders avant de paginer, ce que la mission proscrit explicitement (« ne pas charger tous les Tenders en mémoire pour filtrer »). Le score reste affiché sur chaque ligne/carte de la page déjà retournée (coût borné par la pagination), jamais utilisé comme filtre.

Pas de champ `priority` : absent du domaine Tender, non documenté ailleurs — non inventé pour cette mission.

## Extensibilité de la recherche (IA / plein texte)

Le filtre `search` ne contient aucune logique de correspondance texte dans les use cases ou le repository. Il est isolé derrière un port dédié :

```
apps/api/src/modules/tenders/application/ports/tender-search-provider.ts
  interface TenderSearchProvider { findMatchingTenderIds(criteria): Promise<string[]> }
```

Aujourd'hui, l'unique implémentation est `PrismaIlikeTenderSearchProvider` (`ILIKE` Postgres borné à 500 candidats). Demain, remplacer cette recherche par une recherche plein texte (OpenSearch, déjà dans la stack cible du projet), des filtres avancés combinés, ou un classement assisté par IA ne demande **qu'un nouveau binding DI** (`TENDER_SEARCH_PROVIDER`) — aucun use case, DTO, schéma ou contrôleur n'a besoin de changer. `ListTendersUseCase`, `GetTenderListViewUseCase` et `GetTenderBoardUseCase` dépendent tous exclusivement de cette interface.

## Permissions

Aucune nouvelle permission. Réutilisation stricte de la matrice `ROLE_TENDER_PERMISSIONS` (`tender-permission.ts`) :

- Consultation (Kanban, Liste, statistiques) : `tender:list` (mêmes rôles qu'aujourd'hui — jusqu'à `READ_ONLY`)
- Déplacement d'une carte (changement de statut) : `tender:update` (`ORGANIZATION_ADMIN`, `BID_MANAGER` uniquement)

Le frontend calcule un miroir local (`canChangeTenderStatus`, `apps/web/src/lib/tenders-types.ts`) **uniquement pour l'affichage** (griser le glisser-déposer, bandeau « Lecture seule ») — jamais comme autorité. Chaque déplacement réel repasse par `ChangeTenderStatusUseCase`, qui revalide la permission côté serveur.

## Comportement du glisser-déposer

1. Déplacement optimiste immédiat côté client (carte déplacée de colonne visuellement).
2. Appel de `changeTenderStatusDirectAction` → `POST /tenders/:id/status` (même use case que le changement de statut depuis la fiche Tender).
3. Le backend revalide : organisation active, existence du Tender, permission, transition autorisée (`ALLOWED_TENDER_TRANSITIONS`), et écrit l'audit (`tender.status_changed`, avec `reason: "Deplacement Kanban"` pour distinguer la source sans dupliquer le mécanisme d'audit).
4. Succès → la carte reste dans sa nouvelle colonne.
5. Échec (transition invalide, permission refusée, organisation invalide) → la carte revient intégralement à son état d'origine (colonnes précédentes restaurées) et le message d'erreur de l'API est affiché tel quel.
6. Une carte en cours de déplacement (`pendingTenderId`) ne peut pas être redéplacée tant que la requête précédente n'est pas résolue (anti-double-soumission).

Aucune confirmation supplémentaire n'a été ajoutée pour des statuts « sensibles » : aucune règle métier existante ne l'exige (seule l'archivage, déjà géré sur la fiche Tender, a une confirmation).

## Stratégie de statistiques et performance

Pour éviter tout N+1 :

- Compteurs par colonne du Kanban : une requête `COUNT` + une requête `list()` plafonnée par statut (8 statuts actifs, donc un nombre de requêtes constant, pas proportionnel au nombre de Tenders).
- Répartition par statut (`/stats`) : une seule requête `GROUP BY status` (`countByStatus`), pas 9 requêtes séparées.
- Score de préparation, risques ouverts, checklist incomplète : chaque sous-ressource (checklist, pièces, critères, échéances, risques, alertes) est chargée en **une requête groupée par lot de Tenders** (`listByTenderIds`, `WHERE organization_id = $1 AND tender_id IN (...)`), puis le moteur de score existant (`calculateTenderReadiness`) est exécuté en mémoire pour chaque Tender — aucune requête supplémentaire par ligne.
- « Dossiers à risque » réutilise exactement la même définition que le moteur de score (`hasBlockingIssue` : alerte critique non résolue ou risque critique non résolu) — champ ajouté à `ReadinessResult` pour éviter de dupliquer ce calcul.
- Nouveaux index Prisma : `tenders(organization_id, internal_owner_id)` et `tenders(organization_id, updated_at)` (migration `20260726172649_add_tender_board_indexes`).

**Limite connue et documentée** : le calcul de « dossiers à risque » et de « préparation moyenne » (`GetTenderStatisticsUseCase`) charge jusqu'à 1000 Tenders actifs par organisation pour rester cohérent avec le moteur de score existant sans introduire une deuxième implémentation du calcul. Au-delà de ce volume par organisation, ces deux statistiques deviennent une approximation sur l'échantillon chargé — à revisiter avec une agrégation SQL dédiée si un tenant dépasse ce seuil.

## Décisions techniques

- **Aucun nouveau module NestJS** : tout vit dans `modules/tenders/`, cohérent avec « ne pas introduire un nouveau bounded context inutile ».
- **`ARCHIVED` exclu des colonnes du Kanban** : un Tender archivé est un statut terminal, retiré du pilotage actif ; il reste consultable via la vue Liste avec le filtre `status=ARCHIVED`.
- **Refactor du filtre `search`** : la correspondance ILIKE, auparavant inline dans `PrismaTenderRepository.list()`, a été extraite dans `TenderSearchProvider` pour préparer l'extensibilité demandée (voir plus haut) sans changer le contrat HTTP existant (`search` reste une simple chaîne côté API).
- **@dnd-kit/core** : seule nouvelle dépendance frontend, choisie pour son support clavier natif (accessibilité exigée par la mission) ; `@dnd-kit/sortable` n'a pas été ajouté (pas de réordonnancement au sein d'une colonne demandé).

## Limites connues

- Pas de tests end-to-end automatisés (aucune infrastructure e2e — Playwright config présente mais vide — n'existait avant cette mission) ; le parcours a été validé manuellement (SSR + API réelle).
- Le drag & drop est desktop-first ; sur mobile, la carte reste consultable et le changement de statut se ferait via la fiche Tender (pas de glisser tactile dédié dans cette tranche).
- `deadlinesNext7Days` (statistiques) ne filtre pas par statut actif — un Tender déjà `SUBMITTED`/`WON`/`LOST` dont l'échéance tombe dans les 7 jours reste compté (simplification documentée, impact marginal en pratique).
