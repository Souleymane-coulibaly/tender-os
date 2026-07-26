# TenderOS

Système d'exploitation IA dédié aux appels d'offres.

TenderOS ne se contente pas d'agréger des marchés publics : c'est un copilote IA qui accompagne les entreprises depuis la détection d'un appel d'offres jusqu'au dépôt de la réponse.

## Principes

- **AI First** — chaque fonctionnalité doit être utilisable directement par un agent IA, pas seulement via une interface humaine.
- **Modulaire** — chaque Skill est indépendant et possède sa propre documentation.
- **Simplicité** — chaque décision doit améliorer l'expérience utilisateur.

Voir [PRODUCT_CONSTITUTION.md](PRODUCT_CONSTITUTION.md) pour la vision et les principes fondateurs du produit.

## Documentation

La documentation à jour vit dans trois emplacements :

- [`bible/`](bible/) — domaine métier et produit :
  [`02-product/ubiquitous-language.md`](bible/02-product/ubiquitous-language.md) (vocabulaire),
  [`03-domain/domain-model.md`](bible/03-domain/domain-model.md) (modèle de domaine),
  [`03-domain/business-rules.md`](bible/03-domain/business-rules.md) (règles métier),
  [`03-domain/permissions.md`](bible/03-domain/permissions.md) (permissions),
  [`03-domain/workflow.md`](bible/03-domain/workflow.md) (workflows),
  [`03-domain/events.md`](bible/03-domain/events.md) (événements de domaine),
  [`04-architecture/system-architecture.md`](bible/04-architecture/system-architecture.md) (architecture système),
  [`04-architecture/adr/`](bible/04-architecture/adr/) (Architecture Decision Records)
- [`docs/04-architecture/`](docs/04-architecture/) et [`docs/05-ai/`](docs/05-ai/) — standards d'ingénierie, guidelines API, conception de la base de données, architecture IA
- [`skills/`](skills/) — Skills de gouvernance technique :
  [`engineering-governor/`](skills/engineering-governor/) (comment mener une mission de développement),
  [`platform-foundation/`](skills/platform-foundation/) (comment construire la plateforme : architecture, patterns API/base de données/IA/frontend/tests/sécurité/déploiement)

`PRODUCT_CONSTITUTION.md` (racine) reste le document fondateur du produit.

> ⚠️ L'arborescence `docs/vision/`, `docs/market/`, `docs/product/`, `docs/skills/`, `docs/architecture/`, `docs/prompts/` et `docs/decisions/` est **legacy et dépréciée** (contenu vide ou obsolète, parfois contradictoire avec les documents ci-dessus). Ne pas l'utiliser comme source d'autorité — voir la bannière en tête de chaque fichier concerné.

## Structure

- [apps/api/](apps/api/) — API NestJS (fondation technique, aucun module métier)
- [apps/web/](apps/web/) — Frontend Next.js (fondation technique, page d'accueil minimale)
- [packages/](packages/) — packages partagés (vide à ce stade)
- [services/](services/) — réservé, non utilisé à ce stade
- [infrastructure/](infrastructure/) — réservé, non utilisé à ce stade
- [tests/](tests/) — tests end-to-end (Playwright)

Voir [DEVELOPMENT.md](DEVELOPMENT.md) pour l'installation, les scripts disponibles et les variables d'environnement.

Voir aussi [CLAUDE.md](CLAUDE.md) pour le contexte global du projet et [ROADMAP.md](ROADMAP.md) pour la feuille de route.
