# TenderOS — Platform Architecture Rules

Version : 1.0
Statut : Draft
Rôle concerné : Platform Foundation
Document parent : `skills/platform-foundation/SKILL.md`
Autorité technique : `bible/04-architecture/system-architecture.md`

---

## 1. Objectif

Ce document définit les règles d'architecture obligatoires pour la plateforme TenderOS.

Il précise : les frontières entre couches ; les frontières entre modules ; les dépendances autorisées ; les responsabilités de chaque composant ; les règles d'intégration inter-modules ; les règles d'assemblage NestJS ; les règles de persistance ; les règles de traitement asynchrone ; les règles de sécurité et de multi-tenancy ; les critères permettant d'accepter ou de refuser une conception.

Ces règles s'appliquent à : l'API NestJS ; les workers ; le frontend Next.js ; les modules métier ; les capacités de plateforme ; les intégrations externes ; les capacités IA.

---

## 2. Architecture de référence

TenderOS utilise :

```text
Modular Monolith
+
Domain-Driven Design
+
Clean Architecture
+
Ports and Adapters
+
Internal Event-Driven Integration
```

Vue principale :

```text
┌──────────────────────────────────────────────┐
│                  Interfaces                   │
│ HTTP · Workers · Consumers · CLI · Webhooks   │
└──────────────────────┬───────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────┐
│                 Application                   │
│ Use Cases · Commands · Queries · Policies     │
└──────────────────────┬───────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────┐
│                    Domain                     │
│ Aggregates · Entities · VOs · Domain Events   │
└──────────────────────────────────────────────┘

Infrastructure implements ports required by
Application and Domain.
```

---

## 3. Règle fondamentale de dépendance

Les dépendances doivent toujours pointer vers le cœur.

Dépendances autorisées :

```text
Interfaces      → Application
Interfaces      → Contracts
Infrastructure  → Application
Infrastructure  → Domain
Application     → Domain
Application     → Shared Kernel minimal
Domain          → Shared Kernel minimal
```

Dépendances interdites :

```text
Domain → Application
Domain → Infrastructure
Domain → Interfaces
Domain → NestJS
Domain → Prisma
Domain → PostgreSQL
Domain → Redis
Domain → HTTP
Domain → OpenAI SDK
Domain → Object Storage SDK

Application → Interfaces
Application → Controllers
Application → Prisma
Application → NestJS decorators
Application → Provider SDKs

Frontend → Database
Frontend → Prisma
Module A → Infrastructure privée de Module B
```

---

## 4. Règle de pureté du Domain

Le Domain doit pouvoir être exécuté dans un test unitaire sans : NestJS ; base de données ; serveur HTTP ; variables d'environnement ; queue ; Redis ; stockage de fichiers ; service externe ; fournisseur IA.

Le Domain peut dépendre uniquement de : TypeScript ; primitives standard ; bibliothèques techniques très limitées et validées ; Shared Kernel explicitement autorisé.

### 4.1 Contenu autorisé dans le Domain

Le Domain peut contenir :

```text
Aggregates
Entities
Value Objects
Domain Services
Domain Events
Domain Errors
Repository contracts when domain-owned
Policies purely based on domain state
Specifications when justified
```

### 4.2 Contenu interdit dans le Domain

Le Domain ne doit pas contenir :

```text
Controllers
DTO HTTP
Decorators NestJS
Prisma models
ORM annotations
SQL
HTTP status codes
JSON serialization logic
Queue consumers
Environment configuration
Logging framework
Telemetry SDK
Provider adapters
Prompt templates
React components
```

---

## 5. Règle de responsabilité des couches

### 5.1 Domain

Responsable de : invariants ; transitions d'état ; calculs métier ; décisions fondées sur l'état du Domain ; création d'événements métier ; erreurs métier.

### 5.2 Application

Responsable de : orchestration ; authentification contextualisée ; autorisation ; chargement et sauvegarde ; coordination d'agrégats ; transactions ; audit ; Outbox ; appels de ports ; résultat du use case.

### 5.3 Infrastructure

Responsable de : Prisma ; PostgreSQL ; Redis ; Object Storage ; email ; queue ; fournisseurs externes ; AI providers ; sérialisation technique ; implémentation des ports.

### 5.4 Interfaces

Responsable de : HTTP ; webhooks ; workers ; consumers ; CLI ; mapping entrée-sortie ; protocoles externes.

---

## 6. Frontières des modules

Chaque module possède : un propriétaire métier ; une responsabilité principale ; une API publique ; des données privées ; des use cases publics ; des événements publics éventuels ; des implémentations internes non accessibles.

Exemples de modules :

```text
Identity
Organizations
Memberships
Tenders
Workspaces
Documents
Qualification
Proposals
Submissions
Audit
Notifications
AI
```

### 6.1 Règle de propriété

Une donnée possède un seul module propriétaire.

Le module propriétaire est seul autorisé à : créer cette donnée ; modifier son état métier ; supprimer cette donnée ; imposer ses invariants ; publier ses événements.

Les autres modules peuvent uniquement : appeler une API applicative publique ; consommer un événement ; lire une projection autorisée ; utiliser un contrat public.

### 6.2 Interdictions inter-modules

Un module ne doit pas : écrire directement dans les tables d'un autre module ; importer ses repositories internes ; modifier ses entités ; utiliser ses mappers ; appeler ses controllers ; dépendre de son adapter Prisma ; contourner ses permissions ; répliquer ses Business Rules.

---

## 7. API publique d'un module

L'API publique d'un module peut contenir :

```text
Public Use Cases
Public Queries
Public Contracts
Public Domain Events
Explicit Ports
Read-only Projections
```

Elle ne doit pas exposer :

```text
Prisma Models
Internal Entities for mutation
Private Repositories
Infrastructure Adapters
NestJS internals
Database transaction handles
```

---

## 8. Intégration inter-modules

Les modes d'intégration autorisés sont, par ordre de préférence :

```text
1. Appel d'un use case public
2. Query publique
3. Événement métier
4. Projection de lecture autorisée
```

Le choix dépend du besoin.

### 8.1 Appel synchrone

Utiliser un appel synchrone lorsque : le résultat est immédiatement requis ; l'opération appartient à la même transaction logique ; l'échec doit bloquer l'action ; le couplage est explicite et acceptable.

Exemple :

```text
CreateWorkspace
→ verify Organization membership
→ create Workspace
```

### 8.2 Événement asynchrone

Utiliser un événement lorsque : l'action principale peut réussir sans le consommateur ; plusieurs consommateurs peuvent réagir ; un traitement long est déclenché ; le retry est souhaitable ; le couplage temporel doit être réduit.

Exemple :

```text
DocumentVersionConfirmed
→ ExtractDocumentContent
→ GenerateEmbeddings
→ RefreshSearchIndex
```

### 8.3 Interdiction des appels cachés

Sont interdits : hooks ORM déclenchant du métier ; triggers applicatifs invisibles ; abonnements implicites non documentés ; appels inter-modules depuis des mappers ; effets externes dans des constructors ; événements produits par le controller à la place du Domain.

---

## 9. Structure de module de référence

```text
modules/
└── tenders/
    ├── domain/
    │   ├── aggregates/
    │   ├── entities/
    │   ├── value-objects/
    │   ├── events/
    │   ├── errors/
    │   ├── services/
    │   └── repositories/
    ├── application/
    │   ├── commands/
    │   ├── queries/
    │   ├── use-cases/
    │   ├── policies/
    │   ├── ports/
    │   └── results/
    ├── infrastructure/
    │   ├── persistence/
    │   ├── messaging/
    │   ├── external/
    │   └── mappers/
    ├── interfaces/
    │   ├── http/
    │   ├── workers/
    │   ├── consumers/
    │   └── presenters/
    ├── contracts/
    ├── tests/
    └── tender.module.ts
```

Créer uniquement les dossiers réellement nécessaires.

Les dossiers vides et les abstractions anticipées sont interdits.

---

## 10. Agrégats

Un agrégat : possède une racine ; protège des invariants transactionnels ; contrôle ses modifications ; expose des méthodes métier ; produit ses événements ; limite son périmètre.

Exemple :

```typescript
class Tender {
  shortlist(input: {
    actorId: ActorId;
    reason?: string;
    occurredAt: Date;
  }): void {
    // Validate state and invariants.
    // Change state.
    // Record domain event.
  }
}
```

### 10.1 Interdictions sur les agrégats

Un agrégat ne doit pas : appeler un repository ; appeler un service externe ; publier directement sur une queue ; ouvrir une transaction ; appeler l'AI Gateway ; lire la configuration ; dépendre d'un autre agrégat complet ; retourner des réponses HTTP.

### 10.2 Taille des agrégats

Un agrégat doit rester suffisamment petit pour : limiter les conflits ; éviter les graphes massifs ; préserver les transactions courtes ; faciliter les tests ; maintenir des frontières claires.

Une association métier ne signifie pas automatiquement une composition dans le même agrégat.

---

## 11. Entities et Value Objects

Une Entity possède une identité stable.

Un Value Object est défini par sa valeur.

Utiliser un Value Object lorsqu'il protège : un invariant ; une unité ; un format ; une sémantique ; un ensemble cohérent de propriétés.

Exemples :

```text
Money
EmailAddress
OfficialDeadline
TenderReference
OrganizationId
DocumentChecksum
```

Éviter de créer un Value Object pour chaque chaîne sans bénéfice réel.

---

## 12. Domain Services

Un Domain Service est acceptable lorsque : la règle est métier ; elle ne relève naturellement d'aucun agrégat ; elle reste pure ou déterministe ; elle ne dépend pas de l'infrastructure.

Exemple :

```text
TenderQualificationScoringPolicy
```

Un Domain Service ne doit pas devenir : un use case ; un orchestrateur ; un wrapper de repository ; un service NestJS générique.

---

## 13. Use Cases

Chaque use case représente une intention métier ou applicative unique.

Exemples :

```text
CreateManualTender
ShortlistTender
RecordGoNoGoDecision
CreateDocumentVersion
ApproveProposal
GenerateSubmissionPackage
```

Un use case doit éviter les noms vagues :

```text
ManageTender
ProcessTender
UpdateData
HandleAction
ExecuteWorkflow
```

### 13.1 Structure d'un use case

Ordre recommandé :

```text
1. Validate execution context
2. Authorize actor
3. Load tenant-scoped resources
4. Validate application preconditions
5. Execute Domain behavior
6. Persist changes
7. Record audit
8. Record Outbox events
9. Commit transaction
10. Return result
```

### 13.2 Règles des use cases

Un use case doit : avoir une entrée typée ; avoir un résultat typé ; imposer `organizationId` ; utiliser des ports ; mapper les erreurs ; rester indépendant du transport ; être testable sans serveur HTTP.

Un use case ne doit pas : recevoir une Request HTTP ; retourner une Response HTTP ; utiliser des decorators NestJS ; appeler Prisma directement ; retourner un modèle Prisma ; contenir des règles de présentation ; ouvrir une transaction distribuée.

---

## 14. Commands et Queries

Une Command modifie l'état.

Une Query lit l'état.

La séparation doit rester conceptuelle et légère.

Elle n'impose pas : deux bases ; event sourcing ; infrastructure CQRS complexe ; bus de commandes externe.

### 14.1 Commands

Une Command doit : exprimer une action ; inclure le contexte nécessaire ; être immutable ; éviter les champs génériques ; inclure l'idempotency key si nécessaire.

Exemple :

```typescript
type ShortlistTenderCommand = {
  organizationId: string;
  actorId: string;
  tenderId: string;
  reason?: string;
  expectedVersion?: number;
};
```

### 14.2 Queries

Une Query doit : exprimer le besoin de lecture ; appliquer tenant et permissions ; retourner un read model ; paginer les collections importantes ; éviter de charger un agrégat si inutile.

---

## 15. Policies

Les policies applicatives portent les décisions d'autorisation et les préconditions dépendant du contexte.

Exemple :

```typescript
interface TenderAuthorizationPolicy {
  canShortlist(input: {
    actorId: string;
    organizationId: string;
    tender: Tender;
  }): Promise<boolean>;
}
```

Les policies ne doivent pas : remplacer les invariants du Domain ; retourner une permission sans tenant ; s'appuyer uniquement sur le nom d'un rôle ; être dupliquées dans les controllers.

---

## 16. Ports

Un port représente une frontière externe significative.

Exemples :

```text
TenderRepository
ObjectStorage
EventPublisher
NotificationSender
AIGateway
Clock
IdGenerator
TransactionManager
FeatureFlagProvider
```

Créer un port lorsque : une dépendance externe existe ; plusieurs implémentations sont plausibles ; le test nécessite un fake ; la frontière doit être protégée ; le fournisseur ne doit pas contaminer le cœur.

Ne pas créer une interface pour chaque classe sans raison.

---

## 17. Adapters

Un adapter : implémente un port ; traduit les types ; gère les erreurs techniques ; applique les timeouts ; applique la validation externe ; masque le fournisseur.

Exemples :

```text
PrismaTenderRepository
S3ObjectStorage
OpenAIProviderAdapter
ResendNotificationSender
RedisRateLimiter
```

Un adapter ne doit pas contenir de règle métier.

---

## 18. Mappers

Les mappers séparent :

```text
Persistence
↔
Domain
↔
Public Contract
```

Types de mappers :

```text
Persistence Mapper
Contract Mapper
Presenter
External Provider Mapper
```

Un mapper doit : être déterministe ; ne pas appeler de dépendance externe ; ne pas déclencher d'effet ; ne pas appliquer une permission ; ne pas inventer une valeur métier.

---

## 19. Architecture NestJS

NestJS sert à assembler la plateforme.

Les decorators NestJS sont limités aux couches Interfaces et Infrastructure.

Exemple de module :

```typescript
@Module({
  controllers: [TenderController],
  providers: [
    ShortlistTenderUseCase,
    {
      provide: TENDER_REPOSITORY,
      useClass: PrismaTenderRepository,
    },
  ],
})
export class TenderModule {}
```

### 19.1 Modules globaux

Les modules globaux sont limités.

Peuvent être globaux si nécessaire :

```text
Configuration
Observability
Database connection
Security context
```

Doivent rester explicitement importés lorsque possible :

```text
Feature modules
AI capabilities
Storage
Notifications
Domain modules
```

Éviter un conteneur global rendant toutes les dépendances disponibles partout.

### 19.2 Controllers

Un controller doit rester fin.

Maximum logique attendu :

```text
Validate
Map
Execute
Present
```

Toute branche métier importante dans un controller doit être déplacée.

### 19.3 Guards

Les guards peuvent vérifier : authentification ; présence du tenant ; membership générale ; contraintes techniques de route.

Les autorisations dépendant de la ressource ou de son état doivent généralement rester dans le use case ou une policy appelée par celui-ci.

### 19.4 Interceptors

Les interceptors sont acceptables pour : corrélation ; logs techniques ; métriques ; sérialisation contrôlée ; mapping global d'erreurs techniques.

Ils ne doivent pas : appliquer une Business Rule ; modifier silencieusement les données métier ; charger un agrégat ; produire un audit métier.

---

## 20. Architecture Next.js

Le frontend est organisé par feature et par route.

Règle générale :

```text
Server Components by default
Client Components by necessity
```

### 20.1 Frontières frontend

```text
app/          → routing and page composition
features/     → business-facing UI capabilities
components/   → generic reusable UI
server/       → server-only API access and session context
lib/          → limited technical helpers
```

### 20.2 Interdictions frontend

Le frontend ne doit pas : importer Prisma ; accéder directement à PostgreSQL ; recalculer une permission comme autorité ; modifier localement un statut métier comme vérité finale ; appeler directement un fournisseur IA ; conserver des secrets ; mélanger les caches entre tenants ; exposer des données non présentes dans le contrat API.

### 20.3 BFF et accès API

L'accès aux données doit passer par : API TenderOS ; Server Actions autorisées et contrôlées ; client typé ; contrats partagés stables.

Une Server Action ne doit pas contourner : les use cases ; les permissions ; le tenant scope ; l'audit ; les contrats métier.

---

## 21. Persistance

La persistance est un détail d'infrastructure.

Les tables ne dictent pas directement : les agrégats ; les use cases ; les contrats API ; les événements métier ; les composants frontend.

Le modèle de persistance peut être différent du modèle Domain.

### 21.1 Repositories

Les repositories doivent : être tenant-scoped ; exprimer le besoin ; mapper le modèle ; limiter les données chargées ; supporter la transaction ; traiter la concurrence ; retourner `null` ou une erreur explicite selon contrat.

### 21.2 Read Models

Les read models peuvent utiliser des requêtes optimisées.

Ils peuvent : joindre plusieurs tables ; lire des projections ; retourner des DTO dédiés ; éviter le chargement d'agrégats.

Ils doivent néanmoins respecter : permissions ; tenant ; confidentialité ; pagination ; contrats stables.

---

## 22. Transactions

Le périmètre transactionnel est défini par le use case.

Une transaction peut inclure :

```text
Aggregate changes
History
Audit
Outbox
Idempotency record
```

Elle ne doit pas inclure :

```text
Email
Webhook
LLM call
OCR
Object Storage transfer
Remote API
Long-running processing
```

### 22.1 Transaction Manager

Le mécanisme de transaction doit être abstrait si les use cases doivent rester indépendants de Prisma.

Exemple conceptuel :

```typescript
interface TransactionManager {
  execute<T>(operation: () => Promise<T>): Promise<T>;
}
```

L'implémentation doit permettre aux repositories participants d'utiliser le même contexte transactionnel sans exposer Prisma au use case.

---

## 23. Événements métier

Un événement métier est créé par le Domain lorsqu'un fait significatif se produit.

Exemple :

```typescript
type TenderShortlisted = {
  eventId: string;
  eventType: "TenderShortlisted";
  eventVersion: 1;
  organizationId: string;
  tenderId: string;
  actorId: string;
  occurredAt: string;
};
```

### 23.1 Événement public ou privé

Un événement peut être :

```text
Module-private
Platform-internal
Public integration event
```

Le niveau doit être explicite.

Un événement privé ne doit pas devenir un contrat externe accidentel.

### 23.2 Compatibilité

Les événements publics doivent évoluer de manière compatible.

Préférer : champ optionnel ; nouvelle version ; nouvel événement ; consumer supportant plusieurs versions.

Éviter : suppression de champ ; changement de signification ; renommage silencieux ; modification de type.

---

## 24. Outbox et publication

Tout événement nécessitant une publication fiable hors transaction utilise l'Outbox.

Flux :

```text
Domain behavior
→ Persist aggregate
→ Persist Outbox event
→ Commit
→ Outbox publisher
→ Event bus
```

Le publisher doit : être idempotent ; gérer les retries ; enregistrer les erreurs ; limiter les tentatives ; produire des métriques ; utiliser une Dead Letter si nécessaire.

---

## 25. Workers

Un worker est une interface applicative asynchrone.

Il doit : valider le message ; résoudre le tenant ; appliquer le contexte d'autorisation requis ; appeler un use case ; être idempotent ; gérer les erreurs ; produire des logs ; respecter un timeout.

Un worker ne doit pas : contenir une Business Rule ; écrire directement plusieurs modules ; contourner un use case ; appeler Prisma sans frontière applicative ; ignorer les doublons.

---

## 26. Architecture des fichiers

Les fichiers sont gérés par plusieurs responsabilités distinctes :

```text
Upload Session
Stored Object
Document
Document Version
Processing Run
Extracted Content
Chunk
Embedding
```

Ces concepts ne doivent pas être fusionnés dans une seule table ou une seule classe sans justification.

---

## 27. Architecture IA

Les modules métier ne doivent jamais appeler directement : SDK OpenAI ; SDK Anthropic ; API d'embeddings ; vector store ; prompt engine ; agent framework.

Ils appellent uniquement des capacités applicatives ou l'AI Gateway.

Flux :

```text
Business Use Case
→ AI Use Case
→ AI Gateway
→ Policy
→ Retrieval
→ Provider Adapter
→ Model
→ Schema Validation
→ Citation Validation
→ AI Run
```

---

## 28. Multi-tenancy architectural

Le tenant doit être présent dans :

```text
Execution context
Commands
Queries
Repositories
Database filters
Unique constraints
Events
Jobs
Cache keys
Storage paths
Search filters
Chunks
Embeddings
AI Runs
Exports
Audit
Logs
```

Un identifiant de ressource seul ne constitue jamais une protection suffisante.

### 28.1 Règle de chargement

Préférer :

```typescript
findById({
  organizationId,
  tenderId,
});
```

Interdire :

```typescript
findById(tenderId);
```

pour toute ressource tenant-scoped.

### 28.2 Règle des relations

Une relation entre deux ressources tenant-scoped doit garantir qu'elles appartiennent à la même organisation.

Cette garantie doit exister : dans l'Application ; dans le repository ; dans la base lorsque techniquement possible ; dans les tests.

---

## 29. Sécurité architecturale

La sécurité doit exister à plusieurs niveaux :

```text
Authentication
→ Tenant resolution
→ Membership
→ Permission
→ Resource access
→ Domain invariant
→ Database constraint
→ Audit
```

Aucun niveau ne remplace complètement les autres.

---

## 30. Gestion des erreurs

Les erreurs traversent les couches avec traduction contrôlée.

Exemple :

```text
PostgreSQL unique violation
→ Persistence Conflict Error
→ Application Conflict
→ API error code
→ HTTP 409
```

Les erreurs ne doivent pas exposer les détails de l'infrastructure.

---

## 31. Configuration

La configuration est une dépendance technique.

Elle doit rester hors du Domain.

La configuration peut être injectée dans : adapters ; modules d'assemblage ; services techniques ; bootstrap.

Les use cases ne doivent recevoir que les politiques ou valeurs réellement nécessaires.

---

## 32. Logging

Le logging doit être réalisé aux frontières et dans l'orchestration.

Le Domain ne doit pas dépendre du logger.

Les événements du Domain et les résultats du use case fournissent les informations utiles à l'observabilité.

---

## 33. Feature Flags

Les feature flags sont évalués dans l'Application ou aux Interfaces selon le cas.

Ils ne doivent pas contaminer les agrégats avec des branches techniques.

Une règle métier temporaire n'est pas automatiquement un feature flag.

---

## 34. Tests architecturaux

Le projet doit disposer de contrôles automatiques vérifiant notamment : aucun import Prisma dans Domain ; aucun import NestJS dans Domain ; aucun import Infrastructure depuis Domain ; aucun import privé entre modules ; aucun modèle Prisma dans les contrats publics ; aucun appel direct de fournisseur IA hors AI Gateway ; aucune route sans politique d'accès explicite ; aucun repository tenant-scoped sans `organizationId`.

Ces contrôles peuvent utiliser : ESLint boundaries ; dependency-cruiser ; tests d'architecture ; règles TypeScript ; scripts internes.

---

## 35. Règles d'import

Chaque module doit fournir des points d'entrée publics explicites.

Exemple :

```text
modules/tenders/index.ts
modules/tenders/contracts.ts
```

Les imports profonds privés sont interdits :

```typescript
import { PrismaTenderRepository }
  from "@/modules/tenders/infrastructure/persistence/private";
```

Préférer :

```typescript
import { TENDER_MODULE_API }
  from "@/modules/tenders";
```

---

## 36. Shared Kernel

Le Shared Kernel doit rester minimal.

Contenu possible :

```text
Entity IDs
Clock
Id Generator
Domain Event primitives
Execution Context
Pagination primitives
Result types
Technical error base classes
```

Contenu interdit :

```text
All project enums
Generic CRUD service
Generic repository
Cross-module business rules
Prisma models
Controllers
Global mutable state
```

---

## 37. Utilitaires partagés

Un utilitaire partagé doit avoir : plusieurs consommateurs réels ; une responsabilité stable ; aucun comportement métier ambigu ; une API limitée ; un propriétaire.

Une duplication raisonnable est préférable à un utilitaire partagé prématuré.

---

## 38. Résilience architecturale

Toute intégration externe doit être conçue avec :

```text
Timeout
Retry policy
Idempotency
Error classification
Fallback or degradation
Observability
Circuit breaker when justified
```

La résilience ne doit pas être dispersée différemment dans chaque module.

Les mécanismes communs appartiennent à Platform Foundation.

---

## 39. Scalabilité

Le monolithe peut être déployé avec :

```text
Multiple API replicas
Separate worker replicas
Shared PostgreSQL
Optional Redis
Object Storage
```

Les workers peuvent être séparés par type de charge sans transformer les modules en microservices.

---

## 40. Extraction future d'un module

Un module est potentiellement extractible s'il possède : des frontières claires ; des contrats explicites ; des données propriétaires ; peu d'accès croisés ; des événements versionnés ; une observabilité propre.

L'extractibilité est une conséquence d'une bonne modularité.

Elle ne justifie pas de construire un système distribué prématurément.

---

## 41. Règles de revue architecturale

Toute revue doit vérifier :

### Frontières

- [ ] Le module propriétaire est clair.
- [ ] Les dépendances pointent vers le cœur.
- [ ] Aucun import privé inter-module.
- [ ] L'API publique est minimale.

### Domain

- [ ] Aucun framework.
- [ ] Aucun ORM.
- [ ] Invariants dans le bon composant.
- [ ] Transitions explicites.
- [ ] Événements métier cohérents.

### Application

- [ ] Use case explicite.
- [ ] Permission côté serveur.
- [ ] Tenant explicite.
- [ ] Transaction correcte.
- [ ] Ports adaptés.

### Infrastructure

- [ ] Adapters isolés.
- [ ] Erreurs traduites.
- [ ] Timeouts configurés.
- [ ] Types fournisseur non exposés.
- [ ] Prisma isolé.

### Interfaces

- [ ] Controllers fins.
- [ ] Validation à la frontière.
- [ ] Présentation dédiée.
- [ ] Aucun métier dans le transport.

### Intégration

- [ ] Mode synchrone ou asynchrone justifié.
- [ ] Contrats versionnés.
- [ ] Idempotence.
- [ ] Outbox lorsque requise.
- [ ] Pas d'effet caché.

### Exploitation

- [ ] Logs.
- [ ] Métriques.
- [ ] Traces.
- [ ] Rollback.
- [ ] Health checks.
- [ ] Runbook si critique.

---

## 42. Anti-patterns architecturaux

Sont interdits :

```text
Anemic Domain driven entirely by services
Business logic in controllers
Prisma types in Domain
Prisma models returned by API
Generic repository for all entities
Global service locator
Hidden tenant context
Shared folder without ownership
Direct table access across modules
ORM hooks containing business workflows
Long transaction with external calls
Event used as hidden command
Controller publishing domain events manually
Frontend acting as security boundary
Workers bypassing use cases
Direct LLM call from feature module
Cache without tenant key
Microservices without demonstrated need
Circular module dependencies
Barrel exports exposing internal code
Unbounded shared kernel
```

---

## 43. Exceptions

Une exception architecturale doit être : explicite ; justifiée ; limitée ; approuvée selon la Decision Matrix ; documentée dans un ADR si structurante ; accompagnée d'une stratégie de suppression ou de réévaluation.

Une exception locale ne modifie pas automatiquement la règle générale.

---

## 44. Conditions bloquantes

Une conception doit être bloquée lorsque : le Domain dépend d'un framework ; Prisma traverse vers l'Application ou le Domain ; le tenant n'est pas explicite ; un module écrit dans les tables d'un autre ; une permission est appliquée uniquement côté frontend ; un appel externe long est inclus dans une transaction ; un worker n'est pas idempotent ; un contrat public est rompu sans stratégie ; un événement critique n'est pas fiable ; un fichier est public par défaut ; une capacité IA contourne l'AI Gateway ; une sortie IA non validée modifie directement le métier ; une dépendance circulaire structurelle existe ; la conception nécessite une règle métier non définie.

---

## 45. Exemple de vertical slice conforme

**Shortlist Tender**

### Interfaces

```text
POST /api/v1/tenders/{id}/shortlist
```

Le controller : valide ; construit la commande ; appelle le use case ; présente le résultat.

### Application

```text
ShortlistTenderUseCase
```

Le use case : vérifie acteur et tenant ; vérifie la permission ; charge le Tender ; appelle `tender.shortlist()` ; sauvegarde ; écrit l'audit ; écrit l'Outbox ; commit.

### Domain

```text
Tender.shortlist()
```

Le Domain : vérifie l'état ; modifie le statut ; ajoute l'historique interne approprié ; produit `TenderShortlisted`.

### Infrastructure

```text
PrismaTenderRepository
PrismaAuditRepository
PrismaOutboxRepository
```

### Async

Le publisher publie `TenderShortlisted`.

Les consumers réagissent de manière idempotente.

---

## 46. Exemple non conforme

```typescript
@Post(":id/shortlist")
async shortlist(@Param("id") id: string) {
  const tender = await this.prisma.tender.findUnique({
    where: { id },
  });

  if (tender.status !== "DISCOVERED") {
    throw new BadRequestException();
  }

  const updated = await this.prisma.tender.update({
    where: { id },
    data: { status: "SHORTLISTED" },
  });

  await this.email.send(...);

  return updated;
}
```

Problèmes : absence de tenant ; Prisma dans le controller ; règle métier dans le controller ; absence de permission ; statut modifié directement ; email dans le chemin synchrone ; absence d'audit ; absence d'Outbox ; modèle Prisma exposé ; absence d'idempotence ; transaction non définie.

---

## 47. Template de décision architecturale locale

```markdown
## Architecture Decision

### Context

### Module owner

### Responsibilities

### Public API

### Dependencies

### Domain impact

### Data ownership

### Tenant scope

### Permission model

### Transaction boundary

### Integration mode

### Events

### Failure modes

### Observability

### Tests

### Migration

### Rollback

### Decision level

### ADR required

Yes / No
```

---

## 48. Checklist condensée

Avant d'accepter une conception :

- [ ] Le module propriétaire est clair.
- [ ] L'intention métier est claire.
- [ ] Le Domain reste pur.
- [ ] Le use case orchestre.
- [ ] Le controller reste fin.
- [ ] Prisma reste dans Infrastructure.
- [ ] Le tenant est explicite partout.
- [ ] Les permissions sont côté serveur.
- [ ] Les données ont un propriétaire.
- [ ] Les contrats publics sont minimaux.
- [ ] Les appels inter-modules sont autorisés.
- [ ] Les événements représentent des faits.
- [ ] L'Outbox est utilisée si nécessaire.
- [ ] Les workers sont idempotents.
- [ ] Les appels externes ont un timeout.
- [ ] Les transactions sont courtes.
- [ ] Les tests négatifs existent.
- [ ] L'observabilité est prévue.
- [ ] Le rollback est compris.
- [ ] Aucune abstraction prématurée.

---

## 49. Critères d'acceptation

Ce document est correctement appliqué lorsque :

- les dépendances respectent la règle du cœur ;
- le Domain reste indépendant ;
- chaque module possède des frontières claires ;
- les données ont un propriétaire unique ;
- les intégrations inter-modules utilisent des contrats explicites ;
- les controllers et workers restent fins ;
- les use cases portent l'orchestration ;
- Prisma reste confiné à l'Infrastructure ;
- le tenant est propagé dans toutes les couches ;
- les permissions sont appliquées côté serveur ;
- les transactions excluent les appels externes longs ;
- les événements fiables passent par l'Outbox ;
- les consumers sont idempotents ;
- les fournisseurs IA restent derrière l'AI Gateway ;
- les règles architecturales sont vérifiées automatiquement.
