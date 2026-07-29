# TenderOS — System Architecture

Version : 1.0
Statut : Draft
Propriétaires : Product, Engineering Governor & Architecture

---

## 1. Objectif

Ce document définit l'architecture technique de TenderOS.

Il sert de référence pour :

- Claude agissant comme CTO & Lead Developer ;
- les développeurs ;
- les Skills techniques et métier ;
- les revues d'architecture ;
- les décisions d'infrastructure ;
- les développements futurs.

Toute implémentation doit respecter ce document, sauf décision explicitement documentée dans un ADR.

---

## 2. Vision architecturale

TenderOS est conçu comme un SaaS : multi-tenant, modulaire, API-first, event-driven, AI-first, observable, sécurisé, déployable progressivement, compatible avec une évolution vers une architecture distribuée.

L'architecture initiale repose sur un **monolithe modulaire**, accompagné de workers spécialisés.

```text
Web Application
       ↓
Application API
       ↓
Modules métier
       ↓
PostgreSQL / Object Storage / Search
       ↓
Outbox / Event Bus
       ↓
Workers / AI Agents / Connectors
```

---

## 3. Décision principale : monolithe modulaire

TenderOS doit commencer sous la forme d'un monolithe modulaire. Cela signifie :

- une base de code principale ;
- un déploiement API principal ;
- des modules métier clairement séparés ;
- des contrats explicites entre les modules ;
- aucun accès direct non contrôlé aux données d'un autre module ;
- la possibilité d'extraire un module plus tard.

**Pourquoi ne pas commencer avec des microservices ?**

Les microservices introduiraient immédiatement : de la complexité réseau, de la synchronisation distribuée, davantage de déploiements, davantage de monitoring, des coûts supplémentaires, des difficultés de débogage, des transactions distribuées, une charge opérationnelle inutile pour un MVP.

**Règle**

```text
Modular Monolith First
Microservices Only When Proven Necessary
```

Un module ne doit être extrait en service indépendant que lorsqu'une contrainte réelle le justifie : volume très élevé, besoin de scalabilité indépendante, technologie spécialisée, isolation de sécurité, cycle de déploiement différent, responsabilité d'équipe indépendante.

---

## 4. Architecture générale

```text
┌─────────────────────────────────────────────┐
│                  Clients                     │
│                                               │
│  Web App      Future Mobile      Public API  │
└─────────────────────┬─────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│               Edge / Gateway                 │
│                                               │
│ Auth, rate limiting, request IDs, routing    │
└─────────────────────┬─────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│               Application API                │
│                                               │
│ NestJS Modular Monolith                       │
│                                               │
│ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│ │ Identity │ │ Tenders  │ │ Workspaces   │  │
│ └──────────┘ └──────────┘ └──────────────┘  │
│ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│ │Documents │ │ Proposal │ │ Compliance   │  │
│ └──────────┘ └──────────┘ └──────────────┘  │
│ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│ │ Company  │ │   AI     │ │ Submission   │  │
│ │  Brain   │ │Gateway   │ │              │  │
│ └──────────┘ └──────────┘ └──────────────┘  │
└──────────────┬───────────────┬────────────────┘
               │               │
               ▼               ▼
┌──────────────────────┐  ┌─────────────────────┐
│ Transactional Data    │  │ Async Processing    │
│                       │  │                     │
│ PostgreSQL            │  │ Queue / Event Bus   │
│ Prisma                │  │ Workers             │
│ pgvector              │  │ Schedulers          │
└──────────────────────┘  └──────────┬──────────┘
                                      │
                                      ▼
                           ┌──────────────────────┐
                           │ External Services     │
                           │                       │
                           │ BOAMP / TED           │
                           │ LLM Providers         │
                           │ Email                 │
                           │ Object Storage        │
                           │ OCR / Extraction      │
                           └──────────────────────┘
```

---

## 5. Stack technique de référence

### Frontend

```text
Next.js
React
TypeScript
```

Responsabilités : interface utilisateur ; navigation ; formulaires ; visualisation des Workspaces ; interactions avec le Copilot ; affichage des documents ; collaboration ; gestion des états côté client.

### Backend

```text
NestJS
TypeScript
Node.js
```

Responsabilités : APIs ; authentification ; autorisation ; logique applicative ; orchestration métier ; événements ; intégrations ; workers ; audit.

### Base de données

```text
PostgreSQL
Prisma
pgvector
```

Responsabilités : données transactionnelles ; relations métier ; multi-tenancy ; audit ; métadonnées documentaires ; embeddings pour les premiers volumes.

### Recherche

Architecture initiale :

```text
PostgreSQL Full-Text Search
+
pgvector
```

Évolution possible : **OpenSearch** — à n'ajouter que lorsque PostgreSQL ne répond plus correctement aux besoins de : recherche plein texte avancée, facettes, gros volumes, indexation distribuée, analytics de recherche.

### Stockage de fichiers

```text
S3-compatible Object Storage
```

Exemples compatibles : AWS S3 ; Cloudflare R2 ; Scaleway Object Storage ; MinIO en développement.

### Conteneurisation

```text
Docker
Docker Compose
Monorepo
```

Recommandation :

```text
pnpm workspaces
+
Turborepo
```

---

## 6. Structure du dépôt

```text
tender-os/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── ui/
│   ├── config/
│   ├── database/
│   ├── contracts/
│   ├── auth/
│   ├── observability/
│   ├── testing/
│   └── shared-kernel/
│
├── services/
│   ├── document-processing/
│   ├── tender-connectors/
│   └── ai-runtime/
│
├── docs/
│   ├── 00-company/
│   ├── 02-product/
│   ├── 03-domain/
│   ├── 04-architecture/
│   ├── 05-ai/
│   └── 06-skills/
│
├── skills/
│   ├── engineering-governor/
│   ├── platform-foundation/
│   ├── tender-discovery/
│   ├── dce-analyzer/
│   ├── proposal-writer/
│   └── compliance-checker/
│
├── infrastructure/
│   ├── docker/
│   ├── terraform/
│   ├── migrations/
│   └── scripts/
│
├── tests/
│   ├── e2e/
│   ├── integration/
│   └── fixtures/
│
├── CLAUDE.md
├── README.md
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## 7. Architecture des modules backend

Chaque module métier suit une architecture en couches.

```text
Module
├── domain
├── application
├── infrastructure
└── presentation
```

### Domain

Contient : entités ; value objects ; agrégats ; règles métier ; événements métier ; interfaces de repositories ; erreurs métier.

Le Domain ne doit dépendre d'aucun framework.

Interdit dans le Domain : NestJS ; Prisma ; HTTP ; S3 ; OpenAI ; Redis ; dépendances d'infrastructure.

### Application

Contient : use cases ; commands ; queries ; handlers ; orchestration ; transactions applicatives ; contrôle des permissions ; publication des événements.

Exemples : `CreateWorkspace`, `ImportTender`, `RecordGoNoGoDecision`, `ApproveProposal`, `GenerateSubmissionPackage`

### Infrastructure

Contient : repositories Prisma ; stockage S3 ; appels vers les fournisseurs IA ; connecteurs BOAMP/TED ; implémentations des queues ; cache ; email ; indexation.

### Presentation

Contient : contrôleurs REST ; DTO ; validation des entrées ; serialization ; gestion des codes HTTP ; WebSocket éventuel.

---

## 8. Modules métier principaux

**Identity & Access** — utilisateurs ; authentification ; organisations ; memberships ; invitations ; rôles ; permissions ; sessions ; accès externes.

**Tender Discovery** — import des avis ; normalisation ; déduplication ; mise à jour ; matching ; shortlist ; surveillance ; archivage.

**Buyer** — acheteurs publics ; historique ; enrichissement ; relations avec les Tenders.

**Qualification** — grille de qualification ; scoring ; risques initiaux ; recommandation ; décision Go / No-Go ; justification.

**Workspace** — espace de réponse ; membres ; planning ; statuts ; coordination des modules ; milestones.

**Documents** — upload ; téléchargement ; versions ; métadonnées ; classification ; checksums ; liens de stockage ; politiques de rétention.

**DCE** — dossier de consultation ; classification RC, CCTP, CCAP, etc. ; rectificatifs ; comparaison de versions ; état d'analyse.

**AI Analysis** — extraction d'exigences ; critères ; risques ; résumés ; citations ; confiance ; runs IA ; invalidation des analyses.

**Company Brain** — documents d'entreprise ; références ; certifications ; profils ; connaissances validées ; recherche sémantique ; contexte utilisé par l'IA.

**Proposal** — plan de réponse ; sections ; versions ; génération assistée ; édition ; revue ; approbation ; verrouillage.

**Tasks & Collaboration** — tâches ; affectations ; commentaires ; mentions ; activités ; notifications internes.

**Compliance** — checklist ; contrôles ; problèmes bloquants ; avertissements ; dérogations ; rapports.

**Submission** — package final ; manifest ; validation des fichiers ; preuve de dépôt ; enregistrement de la soumission.

**Outcome & Analytics** — résultats ; gains ; pertes ; attribution ; capitalisation ; indicateurs.

**Audit** — actions sensibles ; historique ; traçabilité ; consultation réglementée.

---

## 9. Frontend Architecture

L'application Next.js doit être organisée par domaines fonctionnels.

```text
apps/web/src/
├── app/
├── features/
│   ├── auth/
│   ├── organizations/
│   ├── tenders/
│   ├── workspaces/
│   ├── documents/
│   ├── proposals/
│   └── compliance/
├── components/
├── lib/
├── hooks/
├── providers/
└── styles/
```

**Règles**

Les composants génériques vont dans `packages/ui`. Les composants métier restent dans `features/<domain>`.

Un composant métier ne doit pas être déplacé dans la bibliothèque générique uniquement parce qu'il est réutilisé deux fois.

**Gestion des données** — Server Components + TanStack Query pour les états serveur interactifs.

**Formulaires** — React Hook Form + Zod. Les schémas partagés doivent provenir du package de contrats lorsque cela est approprié.

---

## 10. Communication API

Architecture initiale : **REST JSON**

Pourquoi REST au démarrage : plus simple à développer ; plus simple à déboguer ; facile à documenter ; compatible avec les intégrations ; adapté aux commandes métier.

```text
GET    /api/v1/tenders
POST   /api/v1/tenders
GET    /api/v1/tenders/:tenderId
POST   /api/v1/tenders/:tenderId/shortlist
POST   /api/v1/tenders/:tenderId/go-no-go-decisions

POST   /api/v1/workspaces
GET    /api/v1/workspaces/:workspaceId
POST   /api/v1/workspaces/:workspaceId/documents
```

**Commandes métier** — Une action métier importante doit utiliser un endpoint explicite.

Préférer :

```text
POST /proposals/:id/approve
```

Éviter :

```text
PATCH /proposals/:id
{ "status": "APPROVED" }
```

Le premier exprime l'intention métier et applique correctement les invariants.

---

## 11. Contracts

Les contrats partagés sont placés dans `packages/contracts`. Ils peuvent contenir : DTO publics ; schémas Zod ; types d'événements ; enums exposés ; réponses paginées ; codes d'erreur.

Ils ne doivent pas exposer directement : les modèles Prisma ; les entités de Domain ; les détails internes de stockage.

---

## 12. Base de données

PostgreSQL est la source de vérité transactionnelle.

Principes : clés primaires stables ; `organizationId` sur les ressources tenant-scoped ; contraintes de base de données ; index explicites ; migrations versionnées ; soft delete lorsque requis ; timestamps UTC ; concurrence optimiste sur les agrégats sensibles.

**Accès aux données** — Prisma est utilisé dans la couche infrastructure.

```text
Domain
    ↓ interface
Repository Port
    ↓ implementation
Prisma Repository
```

Le code métier ne doit pas appeler directement Prisma.

**Transactions** — Les opérations modifiant plusieurs objets cohérents doivent s'exécuter dans une transaction.

```text
Create Workspace
├── créer Workspace
├── créer membership du responsable
├── mettre à jour le statut Tender
├── créer Audit Log
└── ajouter événement Outbox
```

Toutes ces opérations doivent réussir ou échouer ensemble.

---

## 13. Multi-tenancy

Architecture initiale :

```text
Shared Database
Shared Schema
Tenant Identifier = organizationId
```

Chaque table métier doit être explicitement associée à une organisation, directement ou via son agrégat parent.

**Règle d'accès** — Toute requête tenant-scoped doit contenir `organizationId`.

```typescript
await prisma.tender.findFirst({
  where: {
    id: tenderId,
    organizationId
  }
});
```

**Défense en profondeur** — Les contrôles multi-tenant doivent exister dans : l'authentification ; l'autorisation ; les services applicatifs ; les repositories ; les tests ; les workers ; les événements ; les recherches vectorielles ; le stockage de fichiers.

**Évolution possible** — Une isolation par base de données ou schéma pourra être proposée pour certains clients enterprise. Elle ne doit pas être implémentée avant un besoin commercial confirmé.

---

## 14. Authentification

L'authentification doit être isolée derrière une abstraction. Le système ne doit pas dépendre irréversiblement d'un fournisseur.

```typescript
interface IdentityProvider {
  verifyAccessToken(token: string): Promise<AuthenticatedIdentity>;
  revokeSession(sessionId: string): Promise<void>;
}
```

Fonctionnalités attendues : email et mot de passe ou magic link ; récupération de compte ; vérification de l'email ; sessions sécurisées ; MFA ultérieur ; SSO enterprise ultérieur.

---

## 15. Autorisation

Le système applique les règles définies dans `PERMISSIONS.md`.

```text
Authentication
    ↓
Organization Membership
    ↓
Role Permissions
    ↓
Workspace Access
    ↓
Resource Policy
    ↓
Business State Validation
```

La vérification doit être effectuée dans la couche application.

```typescript
authorizationService.assertCan({
  actor,
  permission: "proposal:approve",
  resource: proposal
});
```

Les contrôleurs ne doivent pas contenir toute la logique d'autorisation.

---

## 16. Stockage documentaire

Les fichiers ne sont pas stockés directement dans PostgreSQL.

PostgreSQL conserve : nom ; taille ; MIME type ; checksum ; storage key ; version ; confidentialité ; propriétaire ; état du traitement.

L'Object Storage conserve le contenu binaire.

```text
organizations/
  {organizationId}/
    workspaces/
      {workspaceId}/
        consultation-documents/
          {documentId}/
            {versionId}/original.pdf
```

**Upload** — Processus recommandé :

```text
1. Demande d'upload
2. Vérification permission
3. Création d'un upload temporaire
4. Upload vers Object Storage
5. Validation checksum et taille
6. Création de la version documentaire
7. Publication de l'événement
8. Traitement asynchrone
```

---

## 17. Traitement documentaire

Le traitement des documents doit être asynchrone.

```text
DocumentUploaded
    ↓
Malware Scan
    ↓
MIME Validation
    ↓
Text Extraction
    ↓
Document Classification
    ↓
Chunking
    ↓
Embedding
    ↓
Indexing
    ↓
DocumentReady
```

Chaque étape doit avoir : un statut ; un nombre de tentatives ; un code d'erreur ; des timestamps ; une possibilité de relance.

### 17bis. Pipeline réellement implémenté (Sprint 3 — module Extraction)

Le schéma ci-dessus (§17) reste la cible long terme. Le module `Extraction` livré au Sprint 3
implémente le sous-ensemble suivant, réellement construit et testé (voir rapport Sprint 3) :

```text
DceDocument (déjà importé, module DCE)
    ↓
Inspection (PdfInspector — PDF uniquement : texte natif ? scanné ? chiffré ? corrompu ?)
    ↓
Détection de stratégie (extension + contenu réel, jamais l'extension seule)
    ├── NATIVE_TEXT      → pdf-parse (+ OCR ciblé des seules pages sans texte natif, PDF mixte)
    ├── OCR               → Tesseract.js (images, PDF scannés)
    ├── OFFICE_DOCUMENT   → mammoth (DOCX)
    └── SPREADSHEET       → xlsx/SheetJS (XLSX/XLS)
    ↓
Représentation intermédiaire commune (ExtractedContent — page/sheet/section, format-agnostique)
    ↓
Normalisation (Unicode NFC, espaces/lignes, césures PDF, en-têtes/pieds de page répétés)
    ↓
Segmentation déterministe (chunks : ordre, taille max, chevauchement configurable)
    ↓
Persistance (DocumentExtraction, ExtractionAttempt, ExtractionChunk — Postgres, texte inclus,
jamais dans l'object storage pour cette tranche)
    ↓
DceDocument.processingStatus → READY_FOR_ANALYSIS | READY_FOR_ANALYSIS_WITH_WARNINGS
```

**Extraction documentaire ≠ Analyse métier par IA.** Le module `Extraction` produit du texte
structuré et exploitable (chunks) ; il ne lit jamais ce texte pour en tirer un sens métier
(clauses, exigences, scoring, mémoire technique). L'analyse IA (futur module distinct, non
construit dans ce sprint) consommera les `ExtractionChunk` déjà persistés en lecture seule —
jamais l'inverse, et jamais les deux responsabilités dans le même module.

Hors périmètre Sprint 3 (volontairement non construit) : embeddings, base vectorielle, RAG,
Company Brain, analyse IA du contenu, export Word/PDF, soumission, veille BOAMP/TED.

---

## 18. Architecture IA

Les modules métier ne doivent pas appeler directement un fournisseur LLM. Ils passent par un AI Gateway interne.

```text
Business Skill
    ↓
AI Gateway
    ↓
Prompt Registry
    ↓
Model Router
    ↓
LLM Provider
```

**AI Gateway** — Responsabilités : choix du modèle ; contrôle des permissions ; filtrage du contexte ; gestion des prompts ; suivi des coûts ; retries ; timeouts ; structured outputs ; citations ; observabilité ; enregistrement des AI Runs.

```typescript
interface AIGateway {
  execute<TInput, TOutput>(
    request: AIExecutionRequest<TInput>
  ): Promise<AIExecutionResult<TOutput>>;
}
```

**Modèle provider-agnostic** — TenderOS doit pouvoir utiliser plusieurs fournisseurs sans changer les modules métier. Exemples possibles : Anthropic ; OpenAI ; Mistral ; modèles privés ultérieurs.

**Règle** — Aucun texte généré ne doit être considéré comme une décision métier validée sans intervention humaine lorsque la règle métier l'exige.

---

## 19. RAG et Company Brain

Pipeline d'indexation :

```text
Authorized Document
    ↓
Text Extraction
    ↓
Normalization
    ↓
Chunking
    ↓
Metadata Enrichment
    ↓
Embedding
    ↓
Vector Storage
```

Chaque chunk doit conserver :

```text
organizationId
documentId
documentVersionId
workspaceId éventuel
pageNumber
section
confidentialityLevel
checksum
embeddingModel
createdAt
```

**Recherche** — Toute recherche doit appliquer les filtres de sécurité avant ou pendant la récupération.

```text
Query
    +
Organization Filter
    +
Workspace Filter
    +
Confidentiality Filter
    +
Version Filter
    =
Authorized Retrieval
```

Un Agent IA ne doit jamais recevoir un document que l'utilisateur n'est pas autorisé à lire.

---

## 20. Event-driven Architecture

Les événements métier suivent `DOMAIN_EVENTS.md`.

```text
Use Case
    ↓
Database Transaction
    ├── Business Changes
    └── Outbox Event
            ↓
Outbox Publisher
            ↓
Event Bus
            ↓
Consumers
```

**Event Bus initial** — Le système peut commencer avec : PostgreSQL Outbox ; worker de polling ; queue simple.

Évolution possible : Redis Streams ; RabbitMQ ; AWS SQS ; Kafka. La technologie ne doit pas être introduite avant nécessité.

**Règle** — Tous les consumers doivent être idempotents.

---

## 21. Workers

Une application worker séparée doit exécuter : traitements documentaires ; synchronisations BOAMP/TED ; notifications ; analyses IA longues ; indexations ; tâches programmées ; publication Outbox ; contrôles d'expiration.

`apps/worker` peut partager les packages métier et infrastructure avec l'API sans dupliquer la logique.

---

## 22. Connecteurs externes

Chaque source externe utilise un adapter dédié.

```typescript
interface TenderSourceConnector {
  sourceType: string;

  fetchNotices(
    cursor?: string
  ): Promise<TenderSourcePage>;

  fetchNotice(
    sourceNoticeId: string
  ): Promise<RawTenderNotice>;
}
```

Connecteurs visés : BOAMP ; TED ; import manuel ; import URL ; autres plateformes ultérieures.

**Normalisation**

```text
Raw Source Data
    ↓
Source Adapter
    ↓
Normalized Tender Candidate
    ↓
Validation
    ↓
Deduplication
    ↓
Tender
```

Les données brutes doivent être conservées pour : audit ; réinterprétation ; débogage ; évolution des mappings.

---

## 23. Cache

Le cache ne doit pas être utilisé comme source de vérité.

Utilisations possibles : sessions ; rate limits ; résultats de recherche temporaires ; métadonnées peu changeantes ; locks distribués futurs.

Redis n'est pas obligatoire pour le tout premier vertical slice. Il peut être ajouté lorsque les besoins sont concrets.

---

## 24. Notifications

Les notifications doivent être déclenchées par des événements.

Canaux initiaux : notifications in-app ; email.

Canaux futurs : Slack ; Microsoft Teams ; webhook ; SMS pour alertes critiques.

```text
Business Event
    ↓
Notification Policy
    ↓
NotificationRequested
    ↓
Channel Adapter
    ↓
Delivery Result
```

---

## 25. Observabilité

TenderOS doit être observable dès le MVP.

**Logs** — doivent être : structurés ; horodatés ; corrélés ; sans secrets ; sans contenu documentaire inutile.

```text
timestamp
level
service
environment
requestId
traceId
organizationId
userId
module
operation
durationMs
errorCode
```

**Metrics** — latence API ; taux d'erreur ; jobs en attente ; durée des traitements PDF ; durée des AI Runs ; consommation de tokens ; taux de réussite des connecteurs ; nombre de Dead Letters.

**Tracing** — Le tracing distribué devient important dès que plusieurs workers ou services participent au même workflow.

---

## 26. Gestion des erreurs

Les erreurs sont classées en trois catégories.

- **Domain Error** — Violation d'une règle métier. Exemple : `PROPOSAL_HAS_BLOCKING_COMMENTS`
- **Application Error** — Action impossible dans le contexte courant. Exemple : `WORKSPACE_ACCESS_DENIED`
- **Infrastructure Error** — Erreur technique externe ou interne. Exemple : `OBJECT_STORAGE_UNAVAILABLE`

**Format API**

```json
{
  "error": {
    "code": "PROPOSAL_HAS_BLOCKING_COMMENTS",
    "message": "La proposition ne peut pas être approuvée.",
    "requestId": "req_123",
    "details": {}
  }
}
```

Les erreurs internes ne doivent jamais exposer : stack traces ; requêtes SQL ; secrets ; prompts internes ; chemins de stockage privés.

---

## 27. Sécurité

**Exigences minimales** — HTTPS obligatoire ; secrets hors du code ; validation de toutes les entrées ; protections contre les injections ; contrôle des fichiers ; vérification des permissions côté serveur ; limitation de débit ; journalisation des actions sensibles ; rotation des secrets ; sauvegardes ; chiffrement au repos selon le fournisseur ; dépendances régulièrement mises à jour.

**Uploads** — doivent vérifier : taille ; extension ; MIME type réel ; checksum ; malware ; droits d'accès ; quotas.

**IA** — Les données envoyées aux fournisseurs IA doivent respecter : les permissions ; le niveau de confidentialité ; la politique de l'organisation ; la minimisation des données ; la traçabilité.

---

## 28. Gestion des secrets

Les secrets doivent être fournis par l'environnement ou un Secret Manager.

```text
DATABASE_URL
OBJECT_STORAGE_SECRET_KEY
AI_PROVIDER_API_KEY
EMAIL_PROVIDER_API_KEY
AUTH_SECRET
```

Interdit : secret dans Git ; secret dans un fichier de documentation ; secret dans un prompt ; secret dans un log ; secret dans un événement métier.

---

## 29. Environnements

Environnements minimaux : `local`, `test`, `staging`, `production`

**Local** — Docker Compose ; données factices ; stockage local compatible S3 ; services externes simulables.

**Test** — bases isolées ; données éphémères ; tests automatisés.

**Staging** — configuration proche de la production ; tests de migration ; tests end-to-end ; validation produit.

**Production** — secrets sécurisés ; sauvegardes ; alertes ; observabilité ; contrôles d'accès renforcés.

---

## 30. CI/CD

Pipeline minimal :

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

Aucun déploiement ne doit avoir lieu si : le build échoue ; les tests critiques échouent ; une migration est invalide ; une vulnérabilité critique connue est introduite.

---

## 31. Tests

**Tests unitaires** — règles métier ; value objects ; services Domain ; policies ; transformations.

**Tests d'intégration** — repositories ; PostgreSQL ; Prisma ; Object Storage ; queues ; adapters.

**Tests de contrat** — API ; événements ; connecteurs ; fournisseurs IA structurés.

**Tests end-to-end** — concernent les workflows critiques.

```text
Création Organization
→ Import Tender
→ Qualification
→ Décision GO
→ Création Workspace
→ Upload DCE
```

**Tests de sécurité** — doivent notamment vérifier : isolation multi-tenant ; permissions ; accès externe ; téléchargement de documents ; RAG ; actions IA.

---

## 32. Feature Flags

Les fonctionnalités risquées ou incomplètes doivent être protégées par des feature flags.

```text
AI_DCE_ANALYSIS
BOAMP_CONNECTOR
TED_CONNECTOR
PROPOSAL_GENERATION
EXTERNAL_CONSULTANT_ACCESS
```

Les flags ne doivent pas remplacer une véritable gestion des permissions.

---

## 33. Migrations

Les migrations doivent être : versionnées ; relues ; testées ; compatibles avec les déploiements ; non destructrices par défaut.

Une migration destructive exige la validation du CEO/Product Owner selon les règles du Skill Engineering Governor.

Processus recommandé :

```text
Expand
→ Migrate Data
→ Switch Application
→ Contract
```

Exemple : ajouter un nouveau champ, copier les données, utiliser le nouveau champ, supprimer l'ancien champ dans une release ultérieure.

---

## 34. Architecture Decision Records

Toute décision technique structurante doit être documentée dans `bible/04-architecture/adr/`.

Convention :

```text
ADR-001-modular-monolith.md
ADR-002-postgresql-primary-database.md
ADR-003-rest-api.md
ADR-004-transactional-outbox.md
```

Un ADR doit contenir : contexte ; décision ; alternatives ; conséquences ; statut.

Statuts : `PROPOSED`, `ACCEPTED`, `SUPERSEDED`, `REJECTED`

---

## 35. Rôle de Claude — Engineering Governor

Claude agit comme CTO & Lead Developer dans le cadre défini par le Skill `skills/engineering-governor/`.

**Claude peut décider seul** — structure interne d'un module conforme ; noms techniques ; refactoring local ; tests ; validation ; gestion des erreurs ; optimisation non destructive ; composants UI ; documentation technique ; ajout d'index justifiés ; corrections de sécurité sans impact produit.

**Claude doit informer avant d'agir** — nouvelle table non prévue ; nouvel endpoint public ; nouvel événement métier ; nouvelle dépendance ; cache ; job planifié ; adaptation technique importante.

**Claude doit obtenir une validation** — changement de stack ; modification du Domain Model ; suppression de données ; changement de permission ; changement de workflow métier ; migration destructive ; changement du modèle multi-tenant ; exposition d'une nouvelle API externe ; coût d'infrastructure significatif ; réduction d'une mesure de sécurité.

---

## 36. Dépendances entre modules

Un module ne doit pas importer directement les détails internes d'un autre module.

**Autorisé** — Application Service ; Public Module Contract ; Domain Event ; Shared Kernel limité

**Interdit** — Import direct d'un repository privé ; Accès direct aux tables d'un autre module ; Import d'une entité interne ; Modification directe d'un agrégat étranger

Exemple : le module Proposal ne doit pas modifier directement un Workspace. Il doit appeler un contrat applicatif public, ou publier un événement métier.

---

## 37. Shared Kernel

Le `shared-kernel` doit rester minimal.

Il peut contenir : identifiants ; types de dates ; monnaie ; pagination ; erreurs de base ; primitives Domain ; types d'audit.

Il ne doit pas devenir un dossier générique contenant toute la logique réutilisable.

Règle :

```text
Duplication locale raisonnable > Couplage global prématuré
```

---

## 38. Performance

Objectifs initiaux indicatifs : API standard : réponse inférieure à 500 ms hors service externe ; pages principales : chargement utile rapide ; jobs longs : asynchrones ; upload : direct vers Object Storage lorsque possible ; pagination obligatoire sur les collections ; aucun chargement complet de gros documents en mémoire ; aucune requête N+1 connue sur les parcours critiques.

Les objectifs exacts seront affinés après les premiers usages réels.

---

## 39. Scalabilité

L'architecture doit permettre de scaler séparément : Web ; API ; Workers documentaires ; Workers IA ; Connecteurs.

Les traitements coûteux ne doivent pas bloquer les requêtes HTTP.

Exemple incorrect :

```text
POST /documents
→ attendre extraction PDF
→ attendre embeddings
→ attendre analyse IA
→ répondre après plusieurs minutes
```

Exemple correct :

```text
POST /documents
→ enregistrer upload
→ programmer traitements
→ répondre 202 Accepted
```

---

## 40. Sauvegardes et reprise

La production doit prévoir : sauvegardes PostgreSQL ; versionnement ou réplication Object Storage ; test périodique de restauration ; politique de rétention ; documentation de reprise ; conservation des manifests de soumission.

Les sauvegardes ne sont valides que si leur restauration a été testée.

---

## 41. Architecture MVP

Le MVP ne doit contenir que les composants nécessaires :

```text
Next.js Web App
NestJS API
NestJS Worker
PostgreSQL
Prisma
pgvector
S3-compatible Storage
Transactional Outbox
Email Provider
AI Gateway
```

Ne sont pas obligatoires au début :

```text
Kafka
Kubernetes
OpenSearch
Microservices
GraphQL
Service Mesh
Multi-region
Data Warehouse
```

---

## 42. Première tranche verticale

La première implémentation doit valider toute la chaîne technique.

```text
Authentification
    ↓
Création d'une Organization
    ↓
Création d'un Tender manuel
    ↓
Stockage PostgreSQL
    ↓
Liste des Tenders
    ↓
Fiche Tender
    ↓
Modification du statut
    ↓
Audit Log
```

Cette tranche doit inclure : frontend ; API ; base de données ; permissions ; tests ; logs ; CI ; Docker ; documentation.

---

## 43. Ordre d'implémentation

**Phase 0 — Platform Foundation** — monorepo ; configuration TypeScript ; Docker ; PostgreSQL ; Prisma ; CI ; logs ; gestion des erreurs ; health checks ; tests.

**Phase 1 — Identity & Organization** — authentification ; utilisateurs ; organisations ; memberships ; rôles ; permissions.

**Phase 2 — Tender Discovery manuel** — création ; liste ; consultation ; mise à jour ; shortlist ; statut.

**Phase 3 — Qualification & Workspace** — qualification ; Go / No-Go ; Workspace ; membres ; tâches.

**Phase 4 — Documents & DCE** — upload ; stockage ; versions ; extraction ; classification.

**Phase 5 — AI Analysis** — résumé ; exigences ; critères ; risques ; citations.

**Phase 6 — Proposal & Compliance** — plan ; rédaction ; versions ; revue ; checklist ; approbation.

**Phase 7 — Submission & Outcome** — package ; validation ; preuve ; résultat ; capitalisation.

---

## 44. Anti-patterns interdits

Claude ne doit pas introduire :

- microservices prématurés ;
- logique métier dans les contrôleurs ;
- logique métier dans les composants React ;
- accès Prisma dans le Domain ;
- accès inter-tenant non filtré ;
- statut modifié sans use case métier ;
- appels LLM directs depuis les modules ;
- fichiers stockés dans PostgreSQL ;
- suppression définitive par défaut ;
- secrets dans le repository ;
- dépendances inutiles ;
- abstractions sans usage réel ;
- événements utilisés comme commandes cachées ;
- traitement long dans une requête HTTP ;
- entité Domain directement retournée par l'API.

---

## 45. Critères d'acceptation de l'architecture

L'architecture est considérée comme correctement implémentée lorsque :

- le projet est un monolithe modulaire ;
- chaque module respecte les couches définies ;
- le Domain est indépendant des frameworks ;
- PostgreSQL est la source de vérité ;
- l'isolation multi-tenant est testée ;
- les documents sont stockés dans un Object Storage ;
- les traitements longs sont asynchrones ;
- les événements utilisent la Transactional Outbox ;
- les consommateurs sont idempotents ;
- les appels IA passent par l'AI Gateway ;
- les permissions sont appliquées côté serveur ;
- les logs sont structurés ;
- les migrations sont versionnées ;
- les workflows critiques disposent de tests ;
- toute déviation majeure possède un ADR.

---

## 46. Mise à jour d'architecture — organisations, marchés, sources, DCE unique (2026)

Les sections 46 à 54 documentent une mise à jour d'architecture réalisée après l'implémentation réelle des modules Identity, Organizations, Memberships, Tenders, Documents et DCE. Elles **complètent** ce document sans contredire les sections 1-45 sur les principes généraux (monolithe modulaire, DDD, Clean Architecture, multi-tenant, sécurité) — mais elles **corrigent** la référence là où le code réel a divergé du modèle `Workspace` initialement décrit en §8 et dans `bible/03-domain/domain-model.md` : **il n'existe pas de `Workspace`**. `Tender` est directement l'agrégat racine du travail de réponse ; `DCE` s'y rattache directement (`tenderId`), jamais via un `Workspace` intermédiaire. Toute mention de `Workspace` dans les documents antérieurs (`domain-model.md`, `events.md`, `workflow.md`, `permissions.md` §5) reste une cible non implémentée, à réévaluer si un besoin réel de regroupement au-dessus du Tender apparaît — elle ne doit pas être prise comme description de l'existant.

Convention utilisée ci-dessous, répétée à chaque section concernée :

```text
[PRÉPARÉ]   = port, enum, champ ou document d'architecture posé maintenant, aucune logique métier réelle derrière
[DÉVELOPPÉ] = fonctionnalité réellement implémentée et testée
```

---

## 47. Utilisateurs, organisations et propriétaire (OWNER) — [DÉVELOPPÉ]

Le rôle n'est jamais porté directement par `User` : il est porté par `OrganizationMembership` (module Memberships), qui relie un `User` (Identity) à une `Organization` (Organizations) par identifiant uniquement (frontière de module, §36).

```text
User
  └── OrganizationMembership
          ├── id
          ├── userId
          ├── organizationId
          ├── role            (OrganizationRole)
          ├── status          (MembershipStatus : INVITED | ACTIVE | SUSPENDED | REMOVED)
          ├── joinedAt / suspendedAt / expiresAt
          ├── createdAt / updatedAt
```

`OrganizationRole` (8 valeurs, `apps/api/src/modules/memberships/domain/organization-role.ts`) :

```text
OWNER                 — propriétaire, exactement un membre actif à la fois
ORGANIZATION_ADMIN
BID_MANAGER
CONTRIBUTOR
REVIEWER
EXECUTIVE
EXTERNAL_CONSULTANT
READ_ONLY
```

Un rôle plateforme distinct (`PlatformRole` : `PLATFORM_OWNER | PLATFORM_ADMIN | PLATFORM_SUPPORT`, module Platform Administration) existe déjà et reste indépendant — un `OWNER` d'organisation n'a aucun droit plateforme de ce seul fait, et réciproquement.

**Règles appliquées par le Domain et les cas d'usage** (jamais seulement par un contrôleur) — voir `bible/03-domain/business-rules.md` BR-ORG-002/BR-ORG-002bis/BR-ORG-004 pour le détail normatif :

- le créateur d'une organisation devient automatiquement son `OWNER`, dans la même opération atomique que la création de l'`Organization` ;
- une organisation a toujours exactement un `OWNER` actif ;
- le dernier `OWNER` ne peut ni quitter, ni être supprimé, ni être suspendu, ni être rétrogradé ;
- un `Organization Admin` ne peut pas attribuer le rôle `OWNER` par un changement de rôle ordinaire ;
- un utilisateur ne peut pas s'auto-attribuer `OWNER` ;
- la suppression d'une organisation est réservée à son `OWNER`.

---

## 48. Transfert de propriété — [DÉVELOPPÉ]

Cas d'usage dédié `TransferOrganizationOwnershipUseCase` (module Memberships) — jamais un simple `ChangeMembershipRole`.

```text
Avant : Membership A = OWNER, Membership B = ADMIN|CONTRIBUTOR|...
Après : Membership A = ORGANIZATION_ADMIN, Membership B = OWNER
```

Règles : seul l'`OWNER` actif courant peut l'initier ; l'ancien et le nouveau propriétaire doivent appartenir à la même organisation ; le nouveau propriétaire doit déjà être une Membership active ; transfert atomique (une seule transaction Prisma, les deux changements de rôle réussissent ou échouent ensemble) ; l'organisation ne se retrouve jamais sans `OWNER`, à aucun instant observable.

Traçabilité : entrée d'audit `organization_membership.ownership_transferred` (mécanisme d'audit déjà en place, `AuditLogWriter` du module Memberships) portant `organizationId`, `previousOwnerId`, `newOwnerId`, `transferredBy`, `transferredAt`. **[PRÉPARÉ]** — pas de bus d'événements/Outbox distinct : ce projet n'a pas encore de Transactional Outbox réelle (§20 reste une cible), donc aucun événement `OrganizationOwnershipTransferred` publié ailleurs que dans l'audit log pour cette tranche.

Modèle retenu : **propriétaire unique**. L'architecture (rôle porté par la Membership, pas par un champ `ownerId` sur `Organization`) permet d'évoluer vers plusieurs `OWNER` simultanés plus tard sans migration structurelle — **[PRÉPARÉ]**, non activé, car cela complexifierait inutilement le MVP (quel `OWNER` peut retirer quel autre `OWNER` ? aucun besoin documenté ne le justifie aujourd'hui).

---

## 49. Architecture globale des marchés — [DÉVELOPPÉ] pour le cœur, [PRÉPARÉ] pour l'international/privé

`Tender` (module Tenders) reste l'agrégat central unique — aucun moteur distinct par type de marché.

```text
Marchés
├── Marchés publics
│   ├── France        [DÉVELOPPÉ] — cas d'usage réel de ce projet
│   ├── Europe         [PRÉPARÉ]  — country=EU, aucun connecteur
│   └── futurs pays     [PRÉPARÉ]  — enum extensible
│
└── Marchés privés      [PRÉPARÉ]  — marketType=PRIVATE accepté, aucune règle spécifique codée
    ├── consultations privées
    ├── invitations fournisseurs
    └── dépôts sécurisés
```

Champs `Tender` (existants, marqués `[DÉVELOPPÉ]`, et nouveaux, marqués `[PRÉPARÉ]` — Prisma §51) :

| Champ | État | Notes |
|---|---|---|
| `estimatedAmount`, `currency` | [DÉVELOPPÉ] | déjà présents |
| `marketType` | [DÉVELOPPÉ] → enum formalisé | existait en string libre ; validé désormais par `MarketType` (`PUBLIC \| PRIVATE`) côté application, colonne SQL inchangée (VARCHAR, même convention que `TenderStatus`) |
| `country` | [PRÉPARÉ] | `TenderCountry` : `FR \| BE \| DE \| ES \| IT \| LU \| NL \| EU \| OTHER` — défaut `FR` sur les lignes existantes |
| `language` | [PRÉPARÉ] | `TenderLanguage` : `fr \| en \| de \| es \| it \| nl` — défaut `fr` |
| `source` | [PRÉPARÉ] | `TenderSource` : `MANUAL \| BOAMP \| TED \| PRIVATE \| OTHER` — défaut `MANUAL` |
| `externalReference` | [PRÉPARÉ] | identifiant côté source externe, nullable |
| `sourceUrl` | [PRÉPARÉ] | URL de l'avis d'origine, nullable |

`marketType` (nature du marché : public/privé) et `source` (provenance technique/fonctionnelle : import manuel, BOAMP, TED, marché privé...) sont deux dimensions **distinctes**, jamais confondues dans un seul champ.

Valeurs par défaut appliquées aux lignes déjà existantes lors de la migration (§51) : `country=FR`, `language=fr`, `currency` déjà nullable inchangé, `source=MANUAL`, `marketType=PUBLIC` lorsque non renseigné.

---

## 50. Sources et connecteurs — [PRÉPARÉ] (abstraction uniquement)

Port indépendant de NestJS/Prisma/tout SDK externe, posé dans le module Tenders (`apps/api/src/modules/tenders/application/ports/tender-source-connector.ts`) :

```typescript
interface TenderSourceConnector {
  readonly source: TenderSource;
  search(criteria: TenderSearchCriteria): Promise<TenderSourceSearchResult[]>;
  fetchTender(externalReference: string): Promise<ExternalTender>;
  fetchDocuments(externalReference: string): Promise<ExternalTenderDocument[]>;
}
```

**Aucun connecteur réel n'est développé.** Aucune implémentation de ce port n'existe, aucun provider NestJS ne l'enregistre — le port existe uniquement pour que sa forme soit stable le jour où un connecteur sera construit.

Structure de dossier cible, à créer seulement quand un premier connecteur réel sera développé (aucun dossier vide créé maintenant) :

```text
connectors/
├── manual/    (déjà l'implémentation implicite : création directe d'un Tender via l'API)
├── boamp/
├── ted/
├── private/
├── belgium/ ...
└── future/
```

Explicitement hors périmètre pour l'instant : authentification BOAMP, appels API TED, scraping, import automatique, synchronisation planifiée, matching IA, alertes.

---

## 51. Moteur DCE unique — état réel et pipeline cible

Le module `DCE` (`apps/api/src/modules/dce`) est l'unique moteur documentaire, quelle que soit la source du `Tender` auquel il se rattache — un document importé via un connecteur entrerait dans le **même** pipeline qu'un import manuel, jamais un chemin de code séparé.

```text
Source du marché (manuel [DÉVELOPPÉ] | connecteur [PRÉPARÉ])
        │
        ▼
Import du DCE                    [DÉVELOPPÉ] — fichier unique, multi-fichiers, archive ZIP
        │
        ▼
Stockage sécurisé                [DÉVELOPPÉ] — délégué à Documents (StorageProvider)
        │
        ▼
Décompression                    [DÉVELOPPÉ] — yauzl, sécurité ZIP obligatoire (voir §52)
        │
        ▼
Classification documentaire      [DÉVELOPPÉ] — sprint repris par cette mission (§52)
        │
        ▼
Préparation OCR                   [DÉVELOPPÉ] — statut READY_FOR_OCR uniquement (§52)
        │
        ▼
OCR réel                          [PRÉPARÉ] — aucun traitement, aucune infrastructure asynchrone
        │
        ▼
Extraction structurée             [PRÉPARÉ] — hors périmètre de cette mission
        │
        ▼
Analyse IA                        [PRÉPARÉ] — hors périmètre
        │
        ▼
Validation utilisateur            [PRÉPARÉ] — hors périmètre
        │
        ▼
Base de connaissances              [PRÉPARÉ] — hors périmètre
        │
        ▼
Génération de la réponse           [PRÉPARÉ] — hors périmètre
        │
        ▼
Devis prévisionnel                  [PRÉPARÉ] — hors périmètre
        │
        ▼
Export Word/PDF                     [PRÉPARÉ] — hors périmètre
        │
        ▼
Dépôt                                [PRÉPARÉ] — voir §53
```

Concepts réels (noms adaptés à l'existant, pas de duplication) : `Tender` (racine), `Dce` (conteneur, un par Tender), `DceDocument` (lien vers `Document`/`DocumentVersion`, module Documents — le contenu physique n'est jamais dupliqué), porte désormais `category` et `processingStatus` **[DÉVELOPPÉ, cette mission, voir §52]**. `Analysis`/`Submission` : **[PRÉPARÉ]**, non créés en base tant qu'aucun traitement réel ne les consomme — seuls les ports strictement nécessaires sont posés.

---

## 52. Classification documentaire et préparation OCR — [DÉVELOPPÉ]

Reprise exacte du sprint DCE interrompu après l'import/stockage/ZIP (`apps/api/src/modules/dce`). La classification de cette tranche est **déterministe**, jamais un appel IA :

```text
nom du fichier (sans extension) + extension
        ↓
tokenisation (minuscule, accents retirés, séparateurs non alphanumériques)
        ↓
règles déterministes, dans cet ordre :
  1. mots-clés financiers  (bpu, dpgf, dqe, devis, prix, financier, bordereau)   → FINANCIAL
  2. mots-clés techniques  (cctp, technique, specifications)                    → TECHNICAL
  3. mots-clés administratifs (rc, ccap, aapc, dc1-4, reglement, consultation,
     acte, engagement, avis)                                                    → ADMINISTRATIVE
  4. extension image (png/jpg/jpeg), aucun mot-clé reconnu                      → DRAWINGS
  5. aucune règle ci-dessus                                                     → OTHER
        ↓
DceDocumentCategory (domain/dce-document-category.ts) — persisté sur DceDocument
```

Implémentation : `classifyDceDocument` (`domain/dce-document-classifier.ts`), fonction pure, aucune dépendance NestJS/Prisma/IA — appelée synchronement par `ImportDceFilesUseCase` pour chaque fichier accepté. Remplaçable plus tard par une classification IA sans changer `DceDocumentCategory` ni les appelants — **[PRÉPARÉ]** pour cette évolution, aucun fournisseur IA connecté dans cette tranche.

Préparation OCR : `DceDocument` porte un second champ, `processingStatus` (`domain/dce-document-processing-status.ts`, `IMPORTED | READY_FOR_OCR`). La classification étant synchrone et déterministe dans cette tranche, **chaque fichier accepté passe directement à `READY_FOR_OCR`** au moment de l'import (`DceDocument.markReadyForOcr`, idempotent) — aucune distinction PDF scanné/texte n'est faite (elle nécessiterait d'analyser le contenu binaire, hors périmètre déterministe de cette tranche). Aucun nouveau port n'a été créé : le port déjà préparé `AsyncJobSubmitter` (`application/ports/async-job-submitter.ts`, Sprint 0) documentait déjà l'OCR comme un des traitements longs futurs visés — il reste **[PRÉPARÉ]**, non appelé, son adaptateur (`NotWiredAsyncJobSubmitter`) échouant explicitement si jamais invoqué. Un futur sprint OCR réel n'aurait qu'à : consommer les `DceDocument` à `READY_FOR_OCR`, appeler `AsyncJobSubmitter.submit()` avec un job réel, et faire progresser un nouvel état (p. ex. `OCR_DONE`) sans changer la classification ni l'import.

---

## 53. Préparation du futur dépôt des offres — [PRÉPARÉ]

Trois niveaux cibles, aucun développé dans cette tranche : dépôt manuel préparé, dépôt assisté, dépôt automatique lorsque la plateforme l'autorise.

```typescript
interface OfferSubmissionGateway {
  submit(submission: PreparedSubmission): Promise<SubmissionResult>;
  getStatus(externalSubmissionId: string): Promise<SubmissionStatusResult>;
  getReceipt(externalSubmissionId: string): Promise<SubmissionReceipt>;
}
```

Ce contrat reste indépendant d'une plateforme de dépôt particulière — **[PRÉPARÉ]**, non implémenté, pas d'adaptateur. Explicitement hors périmètre : robot Playwright, intégration profil acheteur, signature électronique, coffre-fort de certificats, envoi réel, accusé de réception réel, interface de dépôt.

---

## 54. Modules futurs, veille, marchés privés, international, Enterprise — [PRÉPARÉ] (documentation seule)

Positionnement documentaire uniquement, aucun code introduit par cette mission pour ces sujets :

- **Veille** — source d'identification et d'import de Tenders (BOAMP local/France, TED européen), jamais un moteur DCE séparé : `Connecteur → récupération des avis → normalisation → critères → matching → notification → sélection → création du Tender → import du DCE`. Non développé : abonnements, alertes, notifications, matching IA, recherches enregistrées.
- **Marchés privés** — `PrivateConsultation → SupplierInvitation → SubmissionSpace → Offer → OfferComparison → AwardDecision`, réutilisant les concepts communs (`Tender.marketType = PRIVATE`). Non développé. Le Domain évite toute hypothèse implicite "tous les marchés viennent d'une autorité publique" (ex. `Tender.buyerName` reste un simple texte libre, jamais une contrainte vers un référentiel d'acheteurs publics).
- **International** — `country`/`language`/`currency` déjà extensibles (§49). Le Domain n'a et ne doit avoir aucun texte français codé en dur, aucune hypothèse systématique sur l'euro ou sur BOAMP, aucune validation propre à un seul pays dans une entité générique. Non développé : interface multilingue, traduction, connecteurs nationaux, règles juridiques par pays.
- **Enterprise** — points d'extension futurs uniquement : Public API, Webhooks, SSO/SAML/OIDC/Azure AD/LDAP, Audit Log étendu, Custom Connectors, External Storage, intégrations ERP/CRM. Rien de ce périmètre n'est implémenté.
- **Documentation et formation automatisées** — prévue après stabilisation du design commercialisable (Playwright → captures → documentation/FAQ/guides). Non développée, simple mention de roadmap.
- **Positionnement des modules** (cible, non tous implémentés) : Identity & Access [DÉVELOPPÉ] → Organizations [DÉVELOPPÉ] → Users & Memberships [DÉVELOPPÉ] → Tenders [DÉVELOPPÉ] → Documents [DÉVELOPPÉ] → DCE [DÉVELOPPÉ, cette mission] → OCR [PRÉPARÉ] → DCE Analysis [PRÉPARÉ] → User Validation [PRÉPARÉ] → Knowledge Base [PRÉPARÉ] → Prompt Management [PRÉPARÉ] → AI Generation [PRÉPARÉ] → AI Quotation [PRÉPARÉ] → Export [PRÉPARÉ] → Collaboration [PRÉPARÉ] → Private Markets [PRÉPARÉ] → Watch [PRÉPARÉ] → Submissions [PRÉPARÉ] → Analytics [PRÉPARÉ] → Affiliate [PRÉPARÉ] → Billing [PRÉPARÉ] → Enterprise Integrations [PRÉPARÉ] → Help Center [PRÉPARÉ]. Modules transversaux déjà réels : Identity, Organizations. Transversaux non développés : Billing, Notifications (hors audit déjà réel), Audit (partiel, déjà réel via `AuditLogWriter` par module), Storage (réel, local uniquement), AI Providers (non développé).
