# TenderOS — Guide technique

Ce document explique comment installer, exécuter et valider la fondation technique du monorepo. Il ne couvre aucune règle métier — voir `bible/` et `skills/platform-foundation/` pour l'architecture et les patterns applicables à toute implémentation future.

---

## 1. Prérequis

- Node.js ≥ 20
- pnpm ≥ 9
- Docker (pour PostgreSQL en local)

---

## 2. Structure du monorepo

```text
apps/
├── api/     — NestJS (Interfaces / Application / Domain, Infrastructure via Prisma)
└── web/     — Next.js (App Router)

packages/    — réservé aux futurs packages partagés (vide à ce stade)
```

Aucun module métier n'existe encore. Voir `skills/platform-foundation/MODULE_TEMPLATE.md` pour la structure à appliquer lors de la création du premier module.

---

## 3. Installation

```bash
pnpm install
cp .env.example .env
docker compose up -d
```

`docker compose up -d` démarre uniquement PostgreSQL (voir `docker-compose.yml`). Aucun autre service (MinIO, Redis) n'est provisionné à ce stade — conforme à `skills/platform-foundation/DATABASE_PATTERNS.md` §89 et §26.

---

## 4. Développement

```bash
pnpm dev
```

Démarre `apps/api` (port `API_PORT`, 4000 par défaut) et `apps/web` (port 3000 par défaut) en parallèle.

- API : http://localhost:4000/health
- Web : http://localhost:3000

---

## 5. Scripts disponibles

| Commande | Effet |
|---|---|
| `pnpm dev` | Démarre `api` et `web` en mode watch |
| `pnpm build` | Build de production de chaque application |
| `pnpm lint` | ESLint sur l'ensemble du monorepo |
| `pnpm format` / `pnpm format:check` | Prettier (écriture / vérification) |
| `pnpm typecheck` | `tsc --noEmit` dans chaque application |
| `pnpm test` | Tests unitaires (Vitest) dans chaque application |
| `pnpm test:e2e` | Tests end-to-end (Playwright) |

---

## 6. Variables d'environnement

Voir `.env.example`. Aucun secret réel n'est commité — chaque environnement (local, test, staging, production) définit ses propres valeurs, conformément à `skills/platform-foundation/SECURITY_PATTERNS.md` §24 et `DEPLOYMENT_PATTERNS.md` §11.

| Variable | Usage |
|---|---|
| `NODE_ENV` | Environnement d'exécution |
| `DATABASE_URL` | Connexion PostgreSQL (Prisma) |
| `API_PORT` | Port d'écoute de l'API NestJS (défaut 4000) |
| `WEB_PORT` | Port de développement de Next.js (défaut 3000) |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL de l'API consommée par le frontend |

---

## 7. Base de données

Le schéma Prisma (`apps/api/prisma/schema.prisma`) ne contient encore aucun modèle métier. Avant d'ajouter le premier modèle, lire `skills/platform-foundation/DATABASE_PATTERNS.md` et `bible/03-domain/domain-model.md`.

---

## 8. Déploiement

Cible : Railway (voir `skills/platform-foundation/DEPLOYMENT_PATTERNS.md`). `apps/api` et `apps/web` sont déployés comme deux services distincts, partageant la même base PostgreSQL managée.

---

## 9. Documentation de référence

- `bible/` — domaine métier, règles, permissions, workflows, événements, architecture système
- `docs/04-architecture/`, `docs/05-ai/` — standards d'ingénierie, guidelines API, conception base de données, architecture IA
- `skills/platform-foundation/` — patterns d'implémentation (architecture, base de données, API, IA, frontend, tests, sécurité, déploiement)
- `skills/engineering-governor/` — gouvernance de mission
