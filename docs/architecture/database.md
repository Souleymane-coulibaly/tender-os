# Database — Modèle de données

> ⚠️ **Document obsolète.** Ce fichier appartient à l'arborescence legacy `docs/architecture/`, dépréciée. Le modèle simplifié ci-dessous ne reflète pas le schéma actuel (multi-tenancy, nommage des tables, etc.). Référence à jour : [`docs/04-architecture/DATABASE_DESIGN.md`](../04-architecture/DATABASE_DESIGN.md) et [`skills/platform-foundation/DATABASE_PATTERNS.md`](../../skills/platform-foundation/DATABASE_PATTERNS.md).

## Hiérarchie des entités

```
Organization
    │
    ├── Users
    │
    ├── Company Profile
    │
    ├── Documents
    │
    ├── Certifications
    │
    ├── References
    │
    └── Tender Projects
                │
                ├── Tender
                ├── DCE
                ├── AI Analysis
                ├── Tasks
                ├── Proposal
                └── Submission
```

## Tables

- organizations
- users
- roles
- permissions
- tenders
- buyers
- documents
- proposals
- tasks
- analyses
- notifications
- events
- audit_logs
