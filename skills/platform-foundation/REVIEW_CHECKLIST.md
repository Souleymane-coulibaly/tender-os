# TenderOS — Platform Foundation Review Checklist

Version : 1.0
Statut : Draft
Rôle concerné : Platform Foundation
Document parent : `skills/platform-foundation/SKILL.md`
Documents associés : `ARCHITECTURE_RULES.md`, `MODULE_TEMPLATE.md`, `DATABASE_PATTERNS.md`, `API_PATTERNS.md`, `AI_PATTERNS.md`, `FRONTEND_PATTERNS.md`, `TESTING_PATTERNS.md`, `SECURITY_PATTERNS.md`, `DEPLOYMENT_PATTERNS.md`

---

## 1. Objectif

Ce document consolide, en une checklist unique, les points de conformité architecturale à vérifier avant d'accepter un module, une fonctionnalité ou une Pull Request significative.

Il ne redéfinit aucune règle : chaque item renvoie au document `platform-foundation/*` qui fait autorité sur le sujet. Cette checklist est un filet de sécurité minimal, pas un substitut au jugement d'ingénierie — cohérent avec `skills/engineering-governor/CHECKLIST.md` §1, dont elle est le pendant architectural (Platform Foundation) plutôt que processuel (Engineering Governor).

---

## 2. Mode d'utilisation

```text
[ ]       Non vérifié
[x]       Vérifié
[N/A]     Non applicable
[BLOCKED] Bloquant
```

Pour un changement simple : appliquer les sections concernées, documenter les items non applicables. Pour un changement structurant (nouveau module, nouvelle intégration, changement de schéma multi-tenant) : compléter l'intégralité des sections pertinentes et ne livrer aucun `[BLOCKED]` non résolu (§20).

Cette checklist est destinée à être exécutée par l'Engineering Governor au moment de la revue (`skills/engineering-governor/SKILL.md` §34), en s'appuyant sur les règles détaillées de `platform-foundation/*`.

---

## 3. Frontières et dépendances — `ARCHITECTURE_RULES.md`

- [ ] Les dépendances pointent vers le cœur (`Interfaces → Application → Domain`, `Infrastructure → Application/Domain`).
- [ ] Le Domain ne dépend d'aucun framework, ORM, HTTP, Redis, ou fournisseur IA.
- [ ] Aucun import privé inter-module (`modules/A/** → modules/B/infrastructure/**`).
- [ ] Le module propriétaire de chaque donnée est identifiable et respecté.
- [ ] L'intégration inter-modules utilise un use case public, une query publique, un événement, ou une projection — jamais un accès direct.
- [ ] Aucun appel caché (hook ORM déclenchant du métier, trigger applicatif invisible).
- [ ] Le Shared Kernel reste minimal (identifiants, Clock, primitives d'événements — pas de règle métier transversale).

---

## 4. Structure de module — `MODULE_TEMPLATE.md`

- [ ] L'arborescence suit la structure de référence (`domain/`, `application/`, `infrastructure/`, `interfaces/`, `contracts/`, `tests/`).
- [ ] Aucun dossier vide ou créé par anticipation sans responsabilité réelle.
- [ ] Le fichier `index.ts` du module n'expose que l'API publique autorisée (use cases publics, types de contrats, événements publics).
- [ ] Les conventions de nommage sont respectées (agrégats, use cases, commands, queries, repositories, événements au passé, erreurs).
- [ ] Le module dispose d'une fiche d'identité (`README.md`) à jour : responsabilité, données possédées, API publique, permissions critiques, tenant scope.

---

## 5. Domain

- [ ] Les agrégats protègent leurs invariants via des méthodes métier, pas des setters génériques.
- [ ] `create()` et `rehydrate()` sont distincts ; seul `create()` produit des événements.
- [ ] Les Value Objects sont utilisés lorsqu'ils protègent un invariant, une unité ou un format.
- [ ] Les identifiants métier importants sont typés (`TenderId`, `OrganizationId`, ...).
- [ ] Les erreurs du Domain sont typées, sans détail technique (pas de statut HTTP, pas de SQL).
- [ ] Les événements de domaine décrivent un fait passé, sont immuables et versionnés.
- [ ] Le statut initial et les transitions respectées correspondent au Domain Model réel (`bible/03-domain/business-rules.md`), pas à un exemple générique inventé.

---

## 6. Application / Use Cases

- [ ] Chaque use case représente une intention unique, nommée explicitement (pas `ManageX`, `ProcessX`).
- [ ] L'ordre standard est respecté : validation du contexte → autorisation → chargement tenant-scoped → règles applicatives → Domain → persistance → audit → Outbox → commit → résultat.
- [ ] Le use case ne dépend ni de NestJS, ni de Prisma, ni du transport HTTP.
- [ ] Le résultat retourné est un type applicatif explicite, jamais un modèle Prisma.
- [ ] La transaction exclut tout appel externe long (email, webhook, IA, upload).

---

## 7. Infrastructure et persistance — `DATABASE_PATTERNS.md`

- [ ] Prisma reste confiné à l'Infrastructure ; aucun type Prisma ne traverse une frontière de module ou de contrat public.
- [ ] Les repositories imposent `organizationId` dans chaque méthode tenant-scoped.
- [ ] Les mappers Persistence ↔ Domain sont explicites et déterministes.
- [ ] Les contraintes structurelles (`NOT NULL`, `UNIQUE`, `FOREIGN KEY`, `CHECK`) protègent les invariants critiques en base, pas seulement en application.
- [ ] La concurrence optimiste (`version`) est utilisée sur les ressources sensibles ; aucun écrasement silencieux n'est possible.
- [ ] Toute migration incompatible suit `Expand → Backfill → Switch → Contract`.
- [ ] Une migration destructive est explicitement approuvée avant exécution.
- [ ] Les index correspondent à des requêtes réelles, tenant en première position lorsque pertinent.
- [ ] L'Outbox est alimentée dans la même transaction que la modification métier lorsque requis.

---

## 8. Multi-tenancy

- [ ] `organizationId` est explicite dans : commandes, queries, repositories, workers, événements, caches, chemins de stockage, recherche, AI Runs, logs.
- [ ] Aucune ressource tenant-scoped n'est chargée par son seul identifiant global.
- [ ] Les contraintes uniques incluent le tenant lorsque nécessaire.
- [ ] Un test d'isolation inter-tenant existe pour toute nouvelle capacité de lecture, écriture, suppression, téléchargement ou recherche (`TESTING_PATTERNS.md` §12).
- [ ] Le Workspace est traité comme un périmètre d'accès additionnel, jamais comme une seconde frontière de tenant (`SECURITY_PATTERNS.md` §11).

---

## 9. API — `API_PATTERNS.md`

- [ ] Le nommage des ressources et actions respecte les conventions (`kebab-case`, pluriel, action explicite plutôt que `PATCH` de statut déguisé).
- [ ] Une ressource unique est retournée sans enveloppe `data` ; une collection utilise `{ items, pageInfo }`.
- [ ] Les erreurs utilisent l'enveloppe et les codes du catalogue partagé — aucun code inventé localement.
- [ ] Le mapping code d'erreur → HTTP respecte la table de référence (`API_PATTERNS.md` §15).
- [ ] La pagination par curseur est utilisée pour les collections volumineuses ; le curseur reste opaque.
- [ ] La chaîne d'autorisation complète est appliquée côté serveur avant toute opération sensible.
- [ ] L'anti-énumération (404 vs 403) est appliquée de façon cohérente au sein du module.
- [ ] L'idempotence est prévue pour toute opération rejouable ; la concurrence optimiste pour toute ressource sensible.
- [ ] La sérialisation respecte les conventions (dates ISO 8601 UTC + `officialTimezone` si échéance officielle, montants en chaîne avec devise, casing camelCase/`UPPER_SNAKE_CASE`).
- [ ] Les opérations longues sont exposées en asynchrone (`202 Accepted` + suivi d'opération), jamais en synchrone bloquant.
- [ ] L'OpenAPI est généré et cohérent avec le schéma réel.

---

## 10. IA — `AI_PATTERNS.md`

- [ ] Tout appel IA passe par `AIGateway` ; aucun SDK fournisseur n'est importé hors `packages/ai/providers`.
- [ ] La sortie IA est validée par un schéma explicite avant toute exploitation métier.
- [ ] Le tenant et les permissions sont vérifiés avant la construction du contexte (retrieval), pas après.
- [ ] Les citations pointent vers une version immuable de document.
- [ ] Un AI Run est créé pour toute opération IA significative, avec coût mesuré.
- [ ] Le niveau de validation humaine (A/B/C) est déterminé et respecté ; une sortie de niveau C n'est jamais exécutée automatiquement.
- [ ] Un agent (le cas échéant) respecte `Permissions Agent ⊆ Permissions Utilisateur`, dispose d'outils strictement limités, et de limites bornées (`maxSteps`, `maxModelCalls`, `maxDuration`, `maxCost`).
- [ ] Le contenu récupéré est traité comme donnée non fiable, jamais comme instruction (défense anti-prompt-injection).
- [ ] La dégradation en cas d'indisponibilité IA est vérifiée (le workflow manuel reste possible).

---

## 11. Frontend — `FRONTEND_PATTERNS.md`

- [ ] Server Components utilisés par défaut ; Client Components justifiés par un besoin d'interactivité réel.
- [ ] Aucune règle métier ni dépendance métier dans `packages/ui`.
- [ ] L'accès aux données passe par le client API typé ou une Server Action contrôlée, jamais par un accès direct à l'infrastructure.
- [ ] Les clés de cache (TanStack Query) sont tenant-aware et invalidées explicitement après mutation.
- [ ] Les capacités (`capabilities`) pilotent l'affichage, jamais la sécurité — le serveur reste l'autorité.
- [ ] Les quatre états d'interface (chargement, vide, erreur, succès) sont représentés pour toute donnée asynchrone.
- [ ] Les erreurs API sont mappées vers des messages utilisateur, jamais affichées brutes.
- [ ] L'accessibilité WCAG 2.1 AA de base est respectée sur le parcours concerné.

---

## 12. Tests — `TESTING_PATTERNS.md`

- [ ] Les priorités de couverture sont respectées (règles métier, permissions, multi-tenancy, transactions avant UI).
- [ ] Chaque règle métier critique a un test unitaire du Domain (cas nominal + états invalides).
- [ ] Chaque use case a un test de permission refusée et un test d'isolation tenant.
- [ ] Chaque endpoint a un test de contrat (nominal, validation, permission, tenant, conflit).
- [ ] Les tests IA utilisent un `FakeAIGateway`, jamais un modèle réel.
- [ ] Les tests sont déterministes (Clock injectée, IDs contrôlés, base isolée).
- [ ] Aucun test n'a été supprimé ou désactivé pour faire passer la CI sans justification documentée.
- [ ] Les tests d'architecture (frontières de couches/modules) passent.

---

## 13. Sécurité — `SECURITY_PATTERNS.md`

- [ ] Toute permission utilisée existe dans `bible/03-domain/permissions.md`, au format `resource:action`.
- [ ] La matrice de test de permission est complète (autorisé, non autorisé, autre tenant, suspendu, sans accès Workspace, ressource inexistante).
- [ ] Aucun secret n'apparaît dans le code, les logs, les fixtures, ou les messages d'erreur.
- [ ] Les entrées sont validées à la frontière (body, path params, query params, headers applicatifs, fichiers).
- [ ] Les uploads sont vérifiés (MIME réel, taille, checksum, antivirus) avant traitement.
- [ ] Les accès externes (consultant, lien de partage, clé API, service account) sont minimaux, expirables et audités.
- [ ] Les actions sensibles produisent une entrée d'audit exploitable.
- [ ] CORS, CSRF (si cookies) et headers de sécurité sont configurés — aucun `Access-Control-Allow-Origin: *` sur route authentifiée.
- [ ] Aucune donnée personnelle n'est collectée sans besoin fonctionnel démontré (minimisation RGPD).

---

## 14. Déploiement — `DEPLOYMENT_PATTERNS.md`

- [ ] Le pipeline CI complet est vert (lint, type check, tests, build, migration validation, scan sécurité).
- [ ] Toute migration incompatible respecte `Expand → Backfill → Switch → Contract` et reste compatible avec le code de la version précédente pendant la bascule.
- [ ] Aucun secret n'est injecté dans l'image Docker plutôt que dans l'environnement runtime.
- [ ] Les health checks (`/live`, `/ready`) sont corrects et distincts.
- [ ] Une stratégie de rollback est définie avant tout déploiement structurant.
- [ ] Un feature flag n'est jamais utilisé comme substitut à une permission.
- [ ] Un ADR est créé pour toute décision structurante (nouvelle dépendance majeure, changement d'architecture).

---

## 15. Documentation

- [ ] Le `README.md` du module reflète son état réel (responsabilité, API publique, permissions, événements, limites connues).
- [ ] L'OpenAPI, le schéma de base et la documentation des événements sont mis à jour avec le changement.
- [ ] Toute divergence architecturale volontaire est documentée (ADR ou décision enregistrée), pas laissée implicite.
- [ ] Aucune documentation mise à jour ne contredit un document d'autorité existant sans que la contradiction soit signalée explicitement.

---

## 16. Vue d'ensemble — table de synthèse

| Domaine | Document de référence | Vérifié |
|---|---|---|
| Frontières et dépendances | `ARCHITECTURE_RULES.md` | |
| Structure de module | `MODULE_TEMPLATE.md` | |
| Domain | `ARCHITECTURE_RULES.md`, `MODULE_TEMPLATE.md` | |
| Application / Use Cases | `MODULE_TEMPLATE.md` | |
| Base de données | `DATABASE_PATTERNS.md` | |
| Multi-tenancy | `ARCHITECTURE_RULES.md`, `DATABASE_PATTERNS.md`, `SECURITY_PATTERNS.md` | |
| API | `API_PATTERNS.md` | |
| IA | `AI_PATTERNS.md` | |
| Frontend | `FRONTEND_PATTERNS.md` | |
| Tests | `TESTING_PATTERNS.md` | |
| Sécurité | `SECURITY_PATTERNS.md` | |
| Déploiement | `DEPLOYMENT_PATTERNS.md` | |
| Documentation | ce document §15 | |

---

## 17. Anti-patterns transversaux — rappel condensé

```text
Business logic in controllers, React components, or packages/ui
Prisma type crossing into Domain, Application, or public contracts
Resource loaded by its bare identifier without organizationId
Generic repository or generic CRUD service
Direct provider or LLM call bypassing AIGateway
Response envelope inconsistent with API_PATTERNS.md
Error code invented outside the shared catalogue
Long external call inside a database transaction
Secret committed, logged, or embedded in a Docker image
Test deleted or skipped to make CI pass
Feature flag used as a substitute for a permission
Kubernetes or microservices introduced without a demonstrated constraint
```

---

## 18. Format de rapport de revue

```markdown
## Platform Foundation Review Report

### Scope

### Sections applicables

### Vérifiés

### Non applicables (justifiés)

### Bloqués

| Item | Section | Raison | Action requise |
|---|---|---|---|

### Décisions de niveau 3 en attente

### Verdict

- Approved
- Approved with minor changes
- Changes requested
- Blocked pending decision
```

---

## 19. Conditions bloquantes consolidées

La livraison est bloquée dès qu'un des éléments suivants est vrai (synthèse des conditions bloquantes de chaque document `platform-foundation/*`) :

```text
Le Domain dépend d'un framework, de Prisma, ou d'un fournisseur IA
Une ressource tenant-scoped est accessible sans organizationId explicite
Un appel IA contourne l'AIGateway
Une sortie IA de niveau C peut être exécutée sans validation humaine
Un code d'erreur ou une permission ne respecte pas le catalogue partagé
Une migration destructive n'est pas approuvée
Un secret est exposé dans le code, un log, ou une image
Un test de permission ou d'isolation tenant critique manque ou échoue
Une action sensible n'est pas auditée
Un ADR requis n'existe pas pour une décision structurante
Le pipeline CI n'est pas entièrement vert
```

---

## 20. Definition of Done — Platform Foundation

Un changement est conforme à Platform Foundation lorsque :

```text
Architectural boundaries respected (ARCHITECTURE_RULES.md)
+
Module structure conforms to the reference template (MODULE_TEMPLATE.md)
+
Tenant isolation explicit and tested (DATABASE_PATTERNS.md, SECURITY_PATTERNS.md)
+
API contract matches the shared conventions (API_PATTERNS.md)
+
AI usage passes through the Gateway with validated, traceable output (AI_PATTERNS.md)
+
Frontend keeps business logic server-side (FRONTEND_PATTERNS.md)
+
Test priorities covered, deterministic, none deleted to pass CI (TESTING_PATTERNS.md)
+
Authorization chain and secrets handling verified (SECURITY_PATTERNS.md)
+
Deployment pipeline green, rollback understood (DEPLOYMENT_PATTERNS.md)
+
Documentation updated and consistent with authoritative sources
```

---

## 21. Critères d'acceptation

Cette checklist est correctement appliquée lorsque :

- chaque section pertinente au changement a été parcourue, pas seulement celles jugées confortables ;
- les items non applicables sont explicitement marqués `[N/A]` avec justification, jamais silencieusement omis ;
- aucun `[BLOCKED]` ne subsiste au moment de la livraison sans approbation explicite ;
- le rapport de revue (§18) distingue clairement ce qui a été vérifié de ce qui a été supposé ;
- les conditions bloquantes consolidées (§19) sont systématiquement vérifiées avant toute mise en production ;
- cette checklist reste un complément au jugement d'ingénierie, jamais un substitut à la lecture des documents `platform-foundation/*` qu'elle synthétise.
