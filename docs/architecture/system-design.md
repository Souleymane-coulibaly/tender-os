# System Design

> ⚠️ **Document obsolète.** Ce fichier appartient à l'arborescence legacy `docs/architecture/`, dépréciée. Son contenu (Skills en couches horizontales, OpenSearch/Vector DB/S3 imposés dès le départ) contredit l'architecture actuellement en vigueur. Référence à jour : [`bible/04-architecture/system-architecture.md`](../../bible/04-architecture/system-architecture.md) et [`skills/platform-foundation/`](../../skills/platform-foundation/).

## Vue d'ensemble

```
Frontend
        │
API Gateway
        │
──────────────────────────
Tender Skill
Workspace Skill
AI Skill
Documents Skill
Proposal Skill
Compliance Skill
Analytics Skill
──────────────────────────
        │
PostgreSQL
OpenSearch
Vector DB
S3
```
