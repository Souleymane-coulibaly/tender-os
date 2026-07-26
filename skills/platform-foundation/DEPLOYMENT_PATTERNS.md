# TenderOS — Deployment Patterns

Version : 1.0
Statut : Draft
Rôle concerné : Platform Foundation
Document parent : `skills/platform-foundation/SKILL.md`
Documents associés :

- `bible/04-architecture/system-architecture.md` §26-45 (règles d'autorité — ce document en est la traduction en patterns d'implémentation)
- `docs/04-architecture/ENGINEERING_STANDARDS.md` §75-97
- `skills/platform-foundation/ARCHITECTURE_RULES.md`
- `skills/platform-foundation/DATABASE_PATTERNS.md` §76-131
- `skills/platform-foundation/SECURITY_PATTERNS.md`
- `skills/platform-foundation/TESTING_PATTERNS.md` §35

---

## 1. Objectif

Ce document définit les patterns d'implémentation obligatoires pour la conteneurisation, l'intégration continue, le déploiement et l'exploitation de TenderOS.

Il traduit en patterns concrets (Dockerfiles, pipeline CI, séquencement de déploiement) la doctrine déjà fixée par `system-architecture.md` §26-45 et `ENGINEERING_STANDARDS.md` §75-97, qui restent les documents d'autorité sur les décisions de fond (environnements requis, pipeline minimal, gestion des migrations, ADR). Ce document ne redéfinit aucune règle : il montre comment l'appliquer concrètement, en cohérence avec `DATABASE_PATTERNS.md` (migrations, sauvegardes) et `SECURITY_PATTERNS.md` (secrets, chiffrement).

Il précise notamment : les environnements ; l'infrastructure cible (Railway + Docker) ; les Dockerfiles ; le pipeline CI ; la stratégie de déploiement et de rollback ; les migrations en production ; les health checks ; les feature flags ; la scalabilité ; les sauvegardes ; les conventions Git/PR ; le processus ADR ; les critères de blocage au déploiement.

---

## 2. Documents d'autorité

Ordre de priorité pour toute question relative au déploiement :

```text
1. PRODUCT_CONSTITUTION.md
2. bible/04-architecture/system-architecture.md §26-45
3. docs/04-architecture/ENGINEERING_STANDARDS.md §75-97
4. skills/platform-foundation/ARCHITECTURE_RULES.md
5. skills/platform-foundation/DATABASE_PATTERNS.md
6. skills/platform-foundation/SECURITY_PATTERNS.md
7. skills/platform-foundation/TESTING_PATTERNS.md
8. skills/platform-foundation/DEPLOYMENT_PATTERNS.md   ← ce document
```

`bible/04-architecture/infrastructure.md` et `integrations.md`, ainsi que le legacy `docs/architecture/integrations.md`, sont **vides** — ils ne font pas autorité.

---

## 3. Ce que ce document ne couvre pas

Aucun ADR (`bible/04-architecture/adr/*`, `docs/decisions/*`) ne contient de contenu réel — voir §28. Ce document définit le **processus** ADR, pas le contenu des décisions déjà censées exister (choix Modular Monolith, PostgreSQL, REST, Outbox transactionnel) : ces décisions sont documentées dans `system-architecture.md` et les autres documents `platform-foundation/*`, mais leur justification formelle (alternatives, conséquences) au format ADR reste à rédiger — chantier distinct, hors périmètre de ce document.

De même, ce document ne détaille pas l'observabilité (dashboards, alerting, métriques) au-delà des health checks — ce sujet appartient à un futur document d'observabilité dédié ou à une extension de ce document, non encore rédigé.

---

## 4. Principes directeurs

```text
Boring infrastructure before novel infrastructure
Same image across environments, different configuration
Migrations before code that depends on them
Deployment is reversible, or the risk is explicitly accepted
Health before traffic
Secrets never in the image or the repository
CI blocks before production sees a regression
Kubernetes only when a real constraint demands it
```

---

## 5. Environnements

Minimum requis (`system-architecture.md` §29) : `local`, `test`, `staging`, `production`.

| Environnement | Caractéristiques |
|---|---|
| **Local** | Docker Compose ; données factices ; stockage compatible S3 local (MinIO) ; services externes simulables |
| **Test** | Bases isolées ; données éphémères ; exécuté en CI (`TESTING_PATTERNS.md`) |
| **Staging** | Configuration proche de la production ; tests de migration ; tests E2E ; validation produit avant mise en production |
| **Production** | Secrets sécurisés ; sauvegardes ; alertes ; observabilité ; contrôles d'accès renforcés |

Chaque environnement a : sa propre configuration ; ses propres secrets ; ses propres données ; ses propres ressources ; un accès limité (`SKILL.md` §48.1). Les données de production ne sont jamais copiées vers un environnement inférieur sans anonymisation (`DATABASE_PATTERNS.md` §129).

---

## 6. Infrastructure cible

```text
Hosting        → Railway
Local dev       → Docker Compose
Container runtime → Docker (images de production également basées sur Docker)
Orchestration    → aucune (pas de Kubernetes, §22)
```

Railway héberge les services applicatifs (API, Web, Workers) et la base PostgreSQL managée. Ce choix est cohérent avec `DATABASE_PATTERNS.md` §90 et le principe « boring technology » de `ARCHITECTURE_RULES.md` §40.

---

## 7. Services déployés

```text
web       — Next.js (Interfaces)
api       — NestJS (Interfaces/Application/Domain, via Infrastructure)
worker    — traitements asynchrones (documents, IA, Outbox publisher)
postgres  — base de données managée (Railway)
storage   — Object Storage compatible S3 (Railway ou fournisseur externe)
redis     — optionnel, cache/queue/rate limiting (SKILL.md §20)
```

`web`, `api` et `worker` sont des déploiements distincts pouvant scaler indépendamment (§22), bien qu'ils partagent le même monorepo et la même base de code applicative — cohérent avec le Modular Monolith (`ARCHITECTURE_RULES.md` §2).

---

## 8. Dockerfile — API (multi-stage)

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-slim AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM base AS build
COPY . .
RUN pnpm --filter api build

FROM node:22-slim AS runtime
WORKDIR /app
RUN addgroup --system app && adduser --system --ingroup app app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER app
EXPOSE 3000
HEALTHCHECK CMD node ./dist/healthcheck.js
CMD ["node", "dist/main.js"]
```

Principes (`SKILL.md` §47) : build multi-stage ; image minimale ; utilisateur non-root ; dépendances verrouillées (`pnpm-lock.yaml`) ; aucun secret dans l'image ; health check déclaré ; arrêt gracieux (signal `SIGTERM` géré par NestJS par défaut).

---

## 9. Dockerfile — Web (Next.js)

```dockerfile
FROM node:22-slim AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM base AS build
COPY . .
RUN pnpm --filter web build

FROM node:22-slim AS runtime
WORKDIR /app
RUN addgroup --system app && adduser --system --ingroup app app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

Le mode `standalone` de Next.js limite la taille de l'image et ses dépendances runtime.

---

## 10. Docker Compose — développement local

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: tenderos
      POSTGRES_USER: tenderos
      POSTGRES_PASSWORD: tenderos_local
    ports: ["5432:5432"]
    volumes: ["tenderos_postgres:/var/lib/postgresql/data"]

  storage:
    image: minio/minio
    command: server /data
    ports: ["9000:9000"]
    environment:
      MINIO_ROOT_USER: tenderos
      MINIO_ROOT_PASSWORD: tenderos_local

volumes:
  tenderos_postgres:
```

Cohérent avec `DATABASE_PATTERNS.md` §89. Les applications `api`/`web`/`worker` peuvent être lancées directement via `pnpm dev` en local plutôt que conteneurisées — Docker n'est pas obligatoire pour tous les services applicatifs en local (`DATABASE_PATTERNS.md` §89).

---

## 11. Variables d'environnement

Validées au démarrage, jamais utilisées sans schéma (`SKILL.md` §38) :

```typescript
const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]),
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  AI_PROVIDER_API_KEY: z.string().min(1),
  APP_BASE_URL: z.string().url(),
});
```

L'application refuse de démarrer si une configuration critique est invalide ou manquante — jamais de valeur par défaut silencieuse pour un secret.

---

## 12. Secrets en production

Fournis par l'environnement Railway ou un Secret Manager, jamais par un fichier commité (`system-architecture.md` §28, `SECURITY_PATTERNS.md` §24) :

```text
DATABASE_URL
OBJECT_STORAGE_SECRET_KEY
AI_PROVIDER_API_KEY
EMAIL_PROVIDER_API_KEY
AUTH_SECRET
```

Interdit : secret dans Git ; dans un fichier de documentation ; dans un prompt ; dans un log ; dans un événement métier. Un secret exposé est immédiatement révoqué et remplacé, pas seulement retiré du commit fautif.

---

## 13. Pipeline CI — étapes obligatoires

```text
Install
    ↓
Lint
    ↓
Type Check
    ↓
Unit Tests
    ↓
Integration Tests
    ↓
Build
    ↓
Security Checks
    ↓
Migration Validation
    ↓
Deployment
```

Aucun déploiement n'a lieu si (`system-architecture.md` §30) : le build échoue ; les tests critiques échouent ; une migration est invalide ; une vulnérabilité critique connue est introduite.

Selon le contexte, s'ajoutent (`ENGINEERING_STANDARDS.md` §80, `TESTING_PATTERNS.md` §35) : Contract Tests ; E2E Tests ; Dependency Review ; Container Scan.

---

## 14. Pipeline CI — configuration de référence

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: corepack enable && pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck
      - run: pnpm test:unit
      - run: pnpm test:integration
      - run: pnpm build
      - run: pnpm migrate:validate
      - run: pnpm audit --audit-level=high
```

Un job distinct exécute les tests E2E Playwright contre un environnement de staging ou un build éphémère, séparément du job de vérification rapide.

---

## 15. Migrations en CI/CD

La CI valide qu'une migration : s'applique sans erreur sur un schéma représentatif ; reste compatible avec la version de code encore en production pendant un déploiement progressif ; ne verrouille pas une table de façon prolongée (`DATABASE_PATTERNS.md` §76-86).

```text
pnpm migrate:validate
  → applique les migrations sur une base éphémère
  → vérifie l'absence d'erreur
  → vérifie la compatibilité ascendante déclarée
```

Une migration destructive est bloquée en CI tant qu'elle n'a pas reçu une approbation explicite (`system-architecture.md` §33, `SKILL.md` §36).

---

## 16. Stratégie de déploiement

```text
Build
→ Test
→ Scan
→ Publish Artifact
→ Deploy
→ Run Safe Migrations
→ Health Check
→ Smoke Test
→ Observe
```

Les migrations s'exécutent avant que le nouveau code ne serve du trafic, mais restent compatibles avec l'ancienne version pendant la fenêtre de bascule (§18). Railway gère le remplacement progressif des instances ; l'application garantit elle-même la compatibilité du code avec le schéma en transition.

---

## 17. Migrations en production — séquencement

Rappel de `DATABASE_PATTERNS.md` §78-83, appliqué au déploiement :

```text
Expand   — migration additive déployée en premier, avant le code qui l'utilise
Backfill — exécuté après l'expand, en tâche de fond, par lots
Switch   — nouveau code déployé, lit/écrit la nouvelle structure
Contract — ancienne structure supprimée dans une release ultérieure séparée
```

Une seule release ne combine jamais `Expand` et `Contract` pour un même changement structurant.

---

## 18. Zero-downtime deployment

Le code applicatif et le schéma doivent pouvoir coexister pendant un déploiement progressif (`system-architecture.md` §85) :

```text
Ancien code + Nouveau schéma → doit fonctionner
Nouveau code + Ancien schéma → doit fonctionner
```

pendant toute la fenêtre où les deux versions peuvent coexister (plusieurs instances en rolling deploy, ou une révision précédente encore active le temps du health check). Un changement qui viole cette double compatibilité suit l'expand/contract (§17) plutôt qu'un changement direct.

---

## 19. Health checks

```text
/live   — le processus fonctionne
/ready  — le service peut accepter du trafic (DB, stockage, dépendances critiques accessibles)
```

```typescript
@Controller()
export class HealthController {
  @Get("/live")
  live() {
    return { status: "ok" };
  }

  @Get("/ready")
  async ready() {
    await this.database.ping();
    return { status: "ok" };
  }
}
```

Une dépendance optionnelle (ex. fournisseur IA secondaire) ne rend pas nécessairement le service non `ready` — cohérent avec `SKILL.md` §37 et la dégradation contrôlée de `AI_PATTERNS.md` §31.

---

## 20. Rollback

Chaque déploiement significatif définit avant d'être exécuté : la condition de rollback ; la version précédente disponible ; la compatibilité DB avec cette version précédente (§18) ; la gestion des jobs et messages en cours ; la stratégie de feature flag associée (§21) ; les vérifications post-rollback.

```text
Déploiement problématique détecté
→ Revenir à la révision précédente (Railway)
→ Vérifier la compatibilité du schéma avec cette révision
→ Vérifier les jobs en cours / Dead Letters
→ Confirmer via health check et smoke test
→ Documenter l'incident
```

Si le rollback est impossible (migration déjà contractée, donnée déjà transformée), un forward-fix est préparé et le risque est explicitement accepté — jamais un rollback silencieusement incomplet.

---

## 21. Feature Flags

Utilisés pour isoler une fonctionnalité incomplète, effectuer un rollout progressif, limiter un risque, ou activer une fonction pour certains tenants uniquement (`system-architecture.md` §32) :

```text
AI_DCE_ANALYSIS
BOAMP_CONNECTOR
TED_CONNECTOR
PROPOSAL_GENERATION
EXTERNAL_CONSULTANT_ACCESS
```

```typescript
if (await featureFlags.isEnabled("PROPOSAL_GENERATION", { organizationId })) {
  return this.generateProposalUseCase.execute(command);
}
```

Chaque flag a : un propriétaire ; une description ; une valeur par défaut sûre ; une stratégie de suppression. Un feature flag ne remplace jamais une permission (`system-architecture.md` §32, `SECURITY_PATTERNS.md` — un flag désactivé n'est pas un contrôle de sécurité).

---

## 22. Scalabilité horizontale

L'architecture permet de scaler séparément : Web ; API ; Workers documentaires ; Workers IA ; Connecteurs (`system-architecture.md` §39). Les traitements coûteux ne bloquent jamais une requête HTTP :

```text
Incorrect :
POST /documents → attendre extraction PDF → attendre embeddings
→ attendre analyse IA → répondre après plusieurs minutes

Correct :
POST /documents → enregistrer l'upload → programmer les traitements
→ répondre 202 Accepted
```

Le nombre de réplicas `api`/`web`/`worker` reste indépendant ; le budget de connexions PostgreSQL est dimensionné en conséquence (`DATABASE_PATTERNS.md` §91-92).

---

## 23. Object Storage en production

Compatible S3, versionné ou répliqué pour permettre une restauration (`system-architecture.md` §40). Les uploads transitent par URL signée directement vers le stockage, jamais via le serveur applicatif (`API_PATTERNS.md` §24, `SECURITY_PATTERNS.md` §26).

---

## 24. Observabilité minimale au déploiement

Sans redéfinir une doctrine d'observabilité complète (§3), chaque déploiement vérifie la présence de : logs structurés exploitables (`SKILL.md` §29, `SECURITY_PATTERNS.md` §32) ; métriques de succès/échec/durée par service ; alerte minimale sur un taux d'erreur anormal après déploiement. Un déploiement sans aucune visibilité opérationnelle n'est pas considéré comme production-ready (`SKILL.md` §29).

---

## 25. Sauvegardes et reprise

La production prévoit (`system-architecture.md` §40, `DATABASE_PATTERNS.md` §98-101) : sauvegardes PostgreSQL régulières ; versionnement ou réplication de l'Object Storage ; test périodique de restauration ; politique de rétention ; documentation de reprise ; conservation des manifests de soumission (donnée métier critique à valeur probante).

```text
Une sauvegarde n'est valide que si sa restauration a été testée.
```

---

## 26. Runbook — structure de référence

```markdown
# Runbook — <Service ou incident type>

## Symptômes

## Vérifications immédiates

## Actions de mitigation

## Escalade

## Rollback (si applicable)

## Post-incident
```

Un runbook existe pour chaque workflow critique et chaque dépendance externe significative (fournisseur IA, Object Storage, email) — pas seulement pour la base de données.

---

## 27. Gestion des incidents

En cas d'incident de production : limiter l'impact (feature flag, désactivation ciblée) ; préserver les preuves (logs, traces) ; ne pas conclure une cause racine sans preuve ; communiquer les faits connus séparément des hypothèses ; préparer un correctif minimal avec tests de non-régression ; documenter la cause racine et les actions correctives après résolution.

Cohérent avec le rôle de l'Engineering Governor (`skills/engineering-governor/SKILL.md` §31) pour la classification et l'escalade.

---

## 28. Architecture Decision Records — processus

Un ADR est obligatoire pour une décision structurante (`system-architecture.md` §34, `ENGINEERING_STANDARDS.md` §88) : ajout de Redis ; changement de stratégie d'authentification ; activation de PostgreSQL RLS ; extraction d'un microservice ; ajout d'OpenSearch ; nouveau fournisseur IA principal ; changement de framework ; nouvelle stratégie de stockage.

```text
bible/04-architecture/adr/
├── ADR-001-modular-monolith.md
├── ADR-002-postgresql-primary-database.md
├── ADR-003-rest-api.md
└── ADR-004-transactional-outbox.md
```

`docs/decisions/ADR-001.md` et `ADR-002.md` sont un emplacement legacy déprécié (numérotation et nommage différents, contenu vide) — voir la note ajoutée en tête de ces deux fichiers. `bible/04-architecture/adr/` est l'unique emplacement canonique.

Gabarit :

```markdown
# ADR-NNN: <titre>

## Statut
PROPOSED | ACCEPTED | SUPERSEDED | REJECTED

## Contexte

## Décision

## Alternatives considérées

## Conséquences
```

Comme noté en §3, ces quatre ADR sont actuellement des fichiers vides des deux côtés du dépôt (`bible/04-architecture/adr/`, `docs/decisions/`) — leur contenu réel reste à rédiger ; ce document ne les invente pas.

---

## 29. Convention Git

```text
feature/<scope>
fix/<scope>
refactor/<scope>
docs/<scope>
chore/<scope>
```

Exemples : `feature/manual-tender-creation`, `fix/workspace-tenant-filter`, `docs/api-guidelines` (`ENGINEERING_STANDARDS.md` §75).

---

## 30. Convention de commits

```text
feat:
fix:
refactor:
test:
docs:
chore:
perf:
ci:
build:
```

```text
feat(tenders): add manual tender creation
fix(auth): enforce organization scope on membership lookup
test(proposals): cover blocking approval comments
```

Un commit représente une intention cohérente (`ENGINEERING_STANDARDS.md` §76).

---

## 31. Pull Requests

Une Pull Request contient : contexte ; objectif ; changements principaux ; impacts métier ; impacts techniques ; stratégie de test ; migrations ; risques ; captures d'écran si UI ; ADR si nécessaire (`ENGINEERING_STANDARDS.md` §77).

---

## 32. Taille des Pull Requests

Préférer plusieurs PR cohérentes plutôt qu'une PR massive. Une PR volumineuse doit être justifiée : migration structurelle ; refonte de module ; changement transversal ; génération initiale de plateforme (`ENGINEERING_STANDARDS.md` §78). Aucune modification non demandée n'est ajoutée dans la même PR.

---

## 33. Revue de code

Vérifie au minimum : conformité métier ; permissions ; multi-tenancy ; architecture ; lisibilité ; gestion des erreurs ; tests ; performance ; sécurité ; migrations ; documentation ; compatibilité ascendante (`ENGINEERING_STANDARDS.md` §79).

---

## 34. Lint, formatage et imports

Formatage automatisé (ESLint + Prettier recommandé). La CI refuse : erreurs ESLint ; formatage incorrect ; imports interdits ; dépendances circulaires détectées ; types non valides (`ENGINEERING_STANDARDS.md` §81).

Ordre d'import recommandé : standard library ; dépendances externes ; packages internes ; imports du module ; types ; styles ou ressources (`ENGINEERING_STANDARDS.md` §82). Les imports profonds vers les détails privés d'un package sont interdits — cohérent avec `ARCHITECTURE_RULES.md` §35.

---

## 35. Code généré

Le code généré (client Prisma, contrats générés, types OpenAPI, migrations générées puis relues) est identifiable et n'est pas modifié manuellement sauf procédure documentée. Le code généré ne dispense pas de revue (`ENGINEERING_STANDARDS.md` §83).

---

## 36. Definition of Ready (livraison)

Une tâche est prête à être développée lorsque : l'objectif est clair ; le périmètre est défini ; les règles métier et permissions sont identifiées ; les critères d'acceptation existent ; les dépendances sont connues ; les ambiguïtés critiques sont résolues ; les impacts de données sont identifiés (`ENGINEERING_STANDARDS.md` §89).

---

## 37. Definition of Done (livraison)

Une tâche est terminée lorsque le comportement fonctionne ; les règles métier sont respectées ; les permissions sont appliquées ; l'isolation multi-tenant est vérifiée ; les tests nécessaires existent et passent ; le lint, le type check et le build passent ; les erreurs sont gérées ; les logs sont appropriés ; les migrations sont validées ; la documentation est à jour ; aucun secret n'est exposé ; aucune dette critique n'est introduite ; les critères d'acceptation sont satisfaits (`ENGINEERING_STANDARDS.md` §90).

---

## 38. Critères de blocage au déploiement

Une contribution n'est pas fusionnée, et un déploiement n'a pas lieu, si elle contient : faille de sécurité connue ; accès inter-tenant possible ; violation d'une règle métier ; permission non appliquée ; migration destructive non validée ; test critique en échec ; build en échec ; secret exposé ; perte de données potentielle non maîtrisée ; appel IA non autorisé ; modification d'architecture non documentée (`ENGINEERING_STANDARDS.md` §91).

---

## 39. Checklist de déploiement

**Avant déploiement**

- [ ] Pipeline CI complet passé (§13).
- [ ] Migrations validées et compatibles avec le code précédent (§15, §18).
- [ ] Secrets présents dans l'environnement cible.
- [ ] Feature flags configurés si applicable.
- [ ] Stratégie de rollback définie (§20).

**Pendant déploiement**

- [ ] Health checks suivis.
- [ ] Migrations suivies.
- [ ] Taux d'erreur et latence surveillés.
- [ ] Aucun contrôle critique contourné.

**Après déploiement**

- [ ] Smoke tests exécutés.
- [ ] Workflow principal vérifié manuellement si changement significatif.
- [ ] Logs et métriques vérifiés.
- [ ] Feature flag stabilisé ou retiré selon le plan de rollout.
- [ ] Rapport de déploiement produit si changement structurant.

---

## 40. Anti-patterns interdits

```text
Migration Expand et Contract combinées dans le même déploiement
Code déployé qui ne tolère pas l'ancien schéma pendant la bascule
Secret injecté dans l'image Docker plutôt que dans l'environnement runtime
Déploiement sans health check ni smoke test
Rollback non testé au moment où il devient nécessaire
Feature flag utilisé comme substitut à une permission
Pull Request massive mélangeant plusieurs intentions non liées
Test supprimé ou skip pour faire passer la CI avant un déploiement urgent
Introduction de Kubernetes sans contrainte réelle démontrée
Traitement long exécuté de façon synchrone bloquant un déploiement rolling
ADR absent pour une décision structurante
```

---

## 41. Conditions bloquantes

Le déploiement doit être bloqué lorsque : le pipeline CI n'est pas entièrement vert ; une migration destructive n'a pas d'approbation explicite ; un secret manque ou est exposé ; le rollback n'est pas compris pour un changement structurant ; une régression de sécurité connue est introduite ; un test multi-tenant ou de permission critique échoue ; la compatibilité ascendante du schéma n'est pas garantie pendant la fenêtre de bascule.

---

## 42. Critères d'acceptation

Ce document est correctement appliqué lorsque :

- chaque déploiement suit le pipeline complet défini par `system-architecture.md` §30, sans étape critique contournée ;
- les migrations respectent systématiquement `Expand → Backfill → Switch → Contract` pour tout changement incompatible ;
- le code déployé reste compatible avec le schéma de la version précédente pendant toute fenêtre de bascule ;
- aucun secret ne transite par l'image Docker ou le dépôt Git ;
- chaque déploiement dispose d'une stratégie de rollback connue avant d'être exécuté ;
- les health checks distinguent correctement liveness et readiness ;
- les décisions structurantes produisent un ADR, même si le catalogue actuel reste à peupler (§3, §28) ;
- les conventions Git, commits et Pull Requests restent cohérentes avec `ENGINEERING_STANDARDS.md` ;
- Kubernetes et les microservices restent absents de l'architecture tant qu'aucune contrainte réelle ne les justifie.
