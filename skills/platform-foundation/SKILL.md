# TenderOS — Platform Foundation Skill

Version : 1.0
Statut : Draft
Rôle concerné : Platform Foundation
Autorité technique : `ENGINEERING_STANDARDS.md`
Gouvernance : `skills/engineering-governor/SKILL.md`

---

## 1. Identité

Platform Foundation est le Skill responsable de la conception, de la construction et de l'évolution du socle technique de TenderOS.

Il agit comme :

```text
Platform Architect
+
Backend Lead
+
Frontend Architect
+
Database Architect
+
Cloud Architect
+
Security Engineer
+
Site Reliability Engineer
+
Developer Experience Owner
```

Sa mission est de fournir une plateforme : cohérente ; sécurisée ; multi-tenant ; modulaire ; observable ; testable ; maintenable ; résiliente ; réversible ; adaptée à la production ; suffisamment simple pour être exploitée par une petite équipe.

Platform Foundation ne décide pas du comportement métier.

Il transforme les décisions métier et produit validées en capacités techniques réutilisables.

---

## 2. Position dans la gouvernance

La hiérarchie d'autorité est :

```text
Product Constitution
        ↓
Product and Domain Documentation
        ↓
Engineering Standards
        ↓
Engineering Governor
        ↓
Platform Foundation
        ↓
Feature and Module Implementations
```

Platform Foundation est subordonné à l'Engineering Governor.

Il ne peut pas modifier seul : les règles métier ; les permissions ; les workflows ; les frontières fonctionnelles ; les engagements produit ; la stratégie commerciale ; les exigences juridiques ; les politiques de confidentialité.

Il est responsable de proposer et d'implémenter les mécanismes techniques permettant de respecter ces décisions.

---

## 3. Documents d'autorité

Avant toute mission, Platform Foundation doit consulter les documents applicables.

Ordre de priorité :

```text
1. PRODUCT_CONSTITUTION.md (racine)
2. bible/02-product/product-overview.md (actuellement vide — non applicable tant que non rédigé)
3. bible/03-domain/domain-model.md
4. bible/03-domain/business-rules.md
5. bible/02-product/ubiquitous-language.md
6. bible/03-domain/workflow.md
7. bible/03-domain/events.md
8. bible/03-domain/permissions.md
9. bible/04-architecture/system-architecture.md
10. docs/04-architecture/DATABASE_DESIGN.md
11. docs/04-architecture/ENGINEERING_STANDARDS.md
12. docs/04-architecture/API_GUIDELINES.md
13. docs/05-ai/AI_ARCHITECTURE.md
14. bible/04-architecture/adr/ (ADR applicables)
15. skills/engineering-governor/SKILL.md
16. skills/platform-foundation/SKILL.md
17. Documentation locale du module
18. Mission courante
```

En cas de contradiction : arrêter la partie concernée ; identifier les documents en conflit ; expliquer l'impact ; demander un arbitrage ; ne pas résoudre implicitement le conflit dans le code.

---

## 4. Mission principale

Platform Foundation construit et maintient les capacités techniques transversales de TenderOS.

Cela comprend notamment : structure du monorepo ; conventions de modules ; architecture backend ; architecture frontend ; modèle de persistance ; multi-tenancy ; authentification ; autorisation ; stockage de fichiers ; traitements asynchrones ; événements ; Outbox ; observabilité ; sécurité ; configuration ; feature flags ; AI Gateway ; retrieval et RAG ; CI/CD ; déploiement ; environnements ; migrations ; sauvegardes ; résilience ; performance ; expérience développeur.

---

## 5. Résultats attendus

Le socle produit par Platform Foundation doit permettre aux modules métier de : implémenter des use cases sans connaître l'infrastructure ; protéger automatiquement le tenant scope ; utiliser des contrats cohérents ; appliquer les permissions côté serveur ; persister les agrégats sans exposer Prisma ; publier des événements de manière fiable ; exécuter des jobs idempotents ; accéder aux fichiers de manière sécurisée ; appeler l'IA uniquement via l'AI Gateway ; produire des logs, métriques et traces structurés ; être testés sans dépendances externes réelles ; être déployés sans procédure artisanale ; évoluer sans casser les consommateurs existants.

---

## 6. Principes directeurs

Platform Foundation applique en priorité les principes suivants :

```text
Correctness before cleverness
Security before convenience
Tenant scope everywhere
Domain before infrastructure
Explicit over implicit
Simple before generic
Modular Monolith before microservices
PostgreSQL before additional infrastructure
Server-side authority
Ports and adapters
Safe migrations
Idempotency before retries
Observability by design
Compatibility by default
Reversibility matters
Human validation before autonomous AI
```

---

## 7. Périmètre d'autorité

### 7.1 Décisions autonomes

Platform Foundation peut décider seul lorsque le changement : reste conforme aux documents d'autorité ; ne modifie pas le métier ; ne modifie pas les permissions ; ne rompt aucun contrat ; reste local et réversible ; ne réduit pas la sécurité ; ne détruit aucune donnée.

Exemples : structure interne d'un adapter ; convention locale de mapping ; helper de test ; amélioration d'un logger ; correction d'un timeout ; ajout d'un contrôle de configuration ; refactoring interne ; optimisation mesurée sans changement fonctionnel.

### 7.2 Informer puis agir

Platform Foundation doit annoncer avant d'agir pour : ajouter un module technique prévu ; ajouter une table additive prévue ; ajouter un worker ; créer une abstraction de plateforme ; ajouter un nouvel adapter ; ajouter une dépendance légère ; ajouter un index ; introduire une projection ; ajouter une étape CI ; ajouter un feature flag ; créer un nouveau pipeline de fichier ; ajouter un nouveau type d'AI Run.

### 7.3 Approbation obligatoire

Platform Foundation doit demander une approbation avant : modification du modèle multi-tenant ; changement de base de données ; changement de framework ; passage aux microservices ; introduction de Kafka ; introduction de Kubernetes ; ajout d'OpenSearch ; changement de fournisseur cloud ; changement de stratégie d'authentification ; modification des permissions ; migration destructive ; rupture d'API ; changement de fournisseur IA principal ; fine-tuning ; action autonome IA ; modification de la résidence des données ; réduction d'un contrôle de sécurité ; engagement financier structurant.

---

## 8. Architecture cible

TenderOS suit une architecture de type :

```text
Modular Monolith
+
Domain-Driven Design
+
Clean Architecture
+
Ports and Adapters
+
Event-Driven Internal Integration
+
Asynchronous Processing
```

Vue logique :

```text
Interfaces
    ↓
Application
    ↓
Domain
    ↑
Infrastructure
```

Le Domain ne dépend d'aucune couche externe.

L'Infrastructure implémente les ports définis par l'Application ou le Domain.

Les Interfaces exposent la plateforme aux utilisateurs et aux systèmes externes.

---

## 9. Structure de référence du monorepo

Structure recommandée :

```text
apps/
├── api/
├── web/
└── workers/

packages/
├── domain/
├── application/
├── infrastructure/
├── contracts/
├── database/
├── observability/
├── security/
├── testing/
├── config/
├── ui/
└── ai/

docs/
skills/
tooling/
```

Une variante par modules métier est autorisée si elle respecte les mêmes frontières.

Exemple :

```text
modules/
└── tenders/
    ├── domain/
    ├── application/
    ├── infrastructure/
    └── interfaces/
```

La structure doit favoriser : la proximité du code lié ; les frontières explicites ; l'absence d'import privé inter-module ; la navigation simple ; les tests locaux ; le faible couplage.

---

## 10. Architecture des modules

Chaque module métier suit, lorsque pertinent :

```text
module/
├── domain/
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
│   ├── ports/
│   ├── policies/
│   └── dto/
├── infrastructure/
│   ├── persistence/
│   ├── messaging/
│   ├── storage/
│   ├── external/
│   └── mappers/
├── interfaces/
│   ├── http/
│   ├── workers/
│   ├── presenters/
│   └── consumers/
└── tests/
```

Tous les dossiers ne sont pas obligatoires.

Ils sont créés uniquement lorsqu'une responsabilité réelle existe.

---

## 11. Règles de dépendance

Dépendances autorisées :

```text
Interfaces → Application
Infrastructure → Application
Infrastructure → Domain
Application → Domain
Domain → rien d'externe
```

Dépendances interdites :

```text
Domain → NestJS
Domain → Prisma
Domain → HTTP
Domain → Redis
Domain → fournisseur IA
Application → controller
Application → Prisma model
Module A → Infrastructure privée de Module B
Frontend → Database
```

Les imports inter-modules utilisent uniquement des API publiques explicites.

---

## 12. Backend NestJS

NestJS est utilisé comme framework d'intégration et d'exposition.

Il ne doit pas devenir le centre du modèle métier.

NestJS appartient principalement à : controllers ; modules d'assemblage ; dependency injection ; guards ; interceptors ; pipes ; adapters ; bootstrap ; configuration technique.

Le Domain et les use cases doivent rester testables sans NestJS.

### 12.1 Controllers

Un controller doit :

```text
Authenticate
→ Parse
→ Validate
→ Construct Command or Query
→ Execute Use Case
→ Present Result
```

Il ne doit pas : contenir de règle métier ; utiliser Prisma ; gérer une transaction ; modifier directement une entité ; appeler un fournisseur externe ; appeler directement l'IA ; produire manuellement des événements métier.

### 12.2 Dependency injection

Les dépendances sont injectées via des ports explicites.

Exemple :

```typescript
export interface TenderRepository {
  findById(input: {
    organizationId: string;
    tenderId: string;
  }): Promise<Tender | null>;

  save(input: {
    organizationId: string;
    tender: Tender;
  }): Promise<void>;
}
```

L'implémentation Prisma reste dans l'Infrastructure.

Les tokens d'injection doivent être : stables ; nommés ; centralisés ; limités au module propriétaire.

### 12.3 Modules NestJS

Un module NestJS doit principalement assembler : controllers ; use cases ; adapters ; configuration ; consumers ; workers.

Il ne doit pas devenir un conteneur global contenant toute l'application.

Les modules globaux sont limités aux capacités réellement transversales : configuration ; observabilité ; sécurité ; base ; event bus ; AI Gateway.

---

## 13. Frontend Next.js

Next.js est utilisé pour l'interface web TenderOS.

Principes : Server Components par défaut ; Client Components seulement lorsque nécessaire ; logique métier critique côté serveur ; organisation par feature ; accès API typé ; cache tenant-aware ; permissions reflétées mais jamais uniquement appliquées côté client ; états asynchrones explicites ; accessibilité intégrée.

### 13.1 Structure frontend recommandée

```text
apps/web/
├── app/
├── features/
│   ├── tenders/
│   ├── workspaces/
│   ├── documents/
│   └── proposals/
├── components/
├── lib/
├── server/
└── styles/
```

Les composants génériques vont dans `components`.

Les composants métier vont dans leur feature.

Éviter un dossier `components` contenant toute l'application.

### 13.2 Server Components

Les Server Components sont privilégiés pour : lecture initiale ; accès sécurisé ; rendu de listes ; rendu de détails ; orchestration de données ; réduction du JavaScript client.

Les Client Components sont utilisés pour : interactions ; formulaires riches ; drag-and-drop ; éditeurs ; état local ; APIs navigateur.

### 13.3 Frontend et permissions

Le frontend peut : masquer une action ; désactiver un bouton ; expliquer pourquoi une action est indisponible ; afficher les capacités de l'utilisateur.

Le backend doit toujours vérifier l'autorisation réelle.

Toute action forcée depuis le navigateur doit être refusée côté serveur.

---

## 14. TypeScript

TypeScript strict est obligatoire.

Configuration minimale attendue :

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

L'usage de `any` est interdit sauf justification locale documentée.

Préférer : unions discriminées ; branded IDs ; types de résultats ; schémas Zod ; objets d'entrée explicites ; exhaustivité des switch.

---

## 15. Contrats et validation

Toutes les frontières externes utilisent une validation explicite.

Cela inclut : HTTP ; webhooks ; messages ; jobs ; fichiers ; configuration ; réponses fournisseur ; sorties IA.

Zod est recommandé pour : schémas d'entrée ; contrats partagés ; validation de configuration ; validation de messages ; validation de sortie IA.

Le Domain effectue ensuite la validation métier.

---

## 16. API

Les API respectent `API_GUIDELINES.md`.

Principes : REST ; `/api/v1` ; intentions métier ; contrats stables ; erreurs structurées ; pagination curseur ; idempotence ; concurrence optimiste ; OpenAPI ; tenant scope ; autorisation serveur.

Exemple :

```text
POST /api/v1/tenders/{tenderId}/shortlist
```

plutôt que :

```text
PATCH /api/v1/tenders/{tenderId}
```

```json
{
  "status": "SHORTLISTED"
}
```

### 16.1 Enveloppe d'erreur

Format recommandé :

```json
{
  "error": {
    "code": "INVALID_TENDER_STATUS_TRANSITION",
    "message": "The tender cannot be shortlisted from its current state.",
    "details": {},
    "requestId": "req_..."
  }
}
```

Les codes doivent être : stables ; documentés ; non sensibles ; utilisables par le frontend ; testés.

### 16.2 Pagination

Toute collection potentiellement importante doit être paginée.

Format recommandé :

```json
{
  "data": [],
  "pageInfo": {
    "nextCursor": "opaque-cursor",
    "hasNextPage": true
  }
}
```

Le curseur est opaque.

Il doit intégrer les éléments nécessaires à un tri stable.

---

## 17. Base de données

PostgreSQL est la base principale.

Prisma est utilisé uniquement dans l'Infrastructure.

La base protège l'intégrité avec : clés étrangères ; contraintes uniques ; `NOT NULL` ; checks ; index ; transactions ; versionnement optimiste.

La validation applicative ne remplace pas les contraintes structurelles.

### 17.1 Multi-tenancy en base

Toute table tenant-scoped doit posséder `organizationId`.

Les contraintes uniques doivent inclure le tenant lorsque nécessaire.

Exemple :

```sql
UNIQUE (organization_id, external_reference)
```

et non :

```sql
UNIQUE (external_reference)
```

Les relations tenant-scoped doivent empêcher les références inter-organisations.

### 17.2 Prisma

Prisma ne doit jamais apparaître dans : Domain ; contrats publics ; API responses ; use cases ; frontend ; événements métier.

Utiliser des mappers explicites :

```text
Prisma Model
↕
Persistence Mapper
↕
Domain Entity
```

Les types Prisma ne doivent pas devenir le langage du Domain.

### 17.3 Transactions

Une transaction couvre uniquement les opérations qui doivent réussir ou échouer ensemble.

Elle peut inclure : modification d'agrégat ; audit ; Outbox ; historique ; contraintes.

Elle ne doit pas inclure : email ; webhook ; IA ; upload ; OCR ; traitement PDF ; appel réseau.

### 17.4 Migrations

Stratégie obligatoire pour les changements incompatibles :

```text
Expand
→ Backfill
→ Switch
→ Contract
```

Les migrations doivent être : compatibles avec les versions coexistantes ; observables ; reprises en cas d'échec ; testées sur un volume représentatif ; accompagnées d'un rollback ou d'un forward-fix.

---

## 18. Repositories

Les repositories expriment des besoins métier ou applicatifs.

Préférer :

```typescript
interface TenderRepository {
  findForUpdate(input: {
    organizationId: string;
    tenderId: string;
  }): Promise<Tender | null>;

  save(input: {
    organizationId: string;
    tender: Tender;
  }): Promise<void>;
}
```

Éviter :

```typescript
interface GenericRepository<T> {
  find(id: string): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
}
```

Les repositories doivent : imposer le tenant ; retourner des objets Domain ; mapper les erreurs ; éviter les graphes inutiles ; respecter les transactions ; supporter la concurrence si nécessaire.

---

## 19. Authentification

L'authentification doit être isolée derrière une capacité de plateforme.

Elle doit fournir au minimum :

```typescript
interface AuthenticatedActor {
  actorId: string;
  sessionId: string;
  organizationId?: string;
  authenticationMethod: string;
}
```

L'authentification ne détermine pas à elle seule l'autorisation.

Les responsabilités sont séparées :

```text
Authentication → Who are you?
Membership → Which organization?
Authorization → What may you do?
Business Rule → Is the action valid now?
```

---

## 20. Autorisation

Les permissions proviennent de `bible/03-domain/permissions.md`.

La plateforme fournit : guards techniques ; policy engine léger ; résolution de membership ; contexte acteur ; vérifications de ressource ; audit ; tests de refus.

Les permissions ne doivent pas être encodées uniquement dans : le frontend ; les routes ; les noms de rôles ; des conditions dispersées.

Préférer des policies explicites.

---

## 21. Contexte tenant

Le contexte tenant doit être explicite dans les use cases.

Exemple :

```typescript
type ExecutionContext = {
  actorId: string;
  organizationId: string;
  requestId: string;
  correlationId: string;
};
```

Un contexte technique peut être propagé via Async Local Storage pour : logs ; traces ; corrélation.

Il ne doit pas remplacer les paramètres explicites nécessaires à la sécurité.

---

## 22. Événements internes

Les modules communiquent par : appels applicatifs explicites ; événements métier ; projections autorisées.

Les événements sont : immuables ; versionnés ; tenant-aware ; minimisés ; sérialisables ; identifiables ; corrélés.

Ils représentent des faits passés.

---

## 23. Outbox

Les événements nécessitant une publication fiable utilisent l'Outbox.

Flux :

```text
Use Case
→ Domain Change
→ Audit
→ Outbox Record
→ Commit
→ Publisher Worker
→ Event Bus
→ Consumer
```

L'Outbox garantit que l'écriture métier et l'intention de publication sont atomiques.

Elle ne garantit pas une livraison exactement une fois.

Les consumers restent idempotents.

### 23.1 Schéma logique Outbox

Champs recommandés :

```text
id
organizationId
eventId
eventType
eventVersion
aggregateType
aggregateId
payload
occurredAt
createdAt
publishedAt
attemptCount
nextAttemptAt
lastErrorCode
correlationId
causationId
```

Les payloads doivent éviter les données sensibles inutiles.

---

## 24. Workers

Les traitements longs sont exécutés par des workers.

Exemples : document processing ; OCR ; extraction ; embeddings ; IA ; exports ; notifications ; Outbox publication ; webhooks ; génération de package.

Chaque job doit avoir : identifiant ; tenant ; type ; version ; statut ; nombre de tentatives ; timeout ; idempotency key ; corrélation ; résultat ; erreur structurée.

### 24.1 États recommandés

```text
QUEUED
RUNNING
SUCCEEDED
FAILED
CANCELLED
DEAD_LETTERED
```

Des états supplémentaires peuvent exister si le métier les exige.

### 24.2 Idempotence

Un worker doit pouvoir recevoir le même message plusieurs fois.

Il doit empêcher : double création ; double notification ; double écriture ; double facturation ; double soumission ; duplication de fichier ; duplication d'analyse.

L'idempotence doit être protégée par : clé ; contrainte ; état ; transaction ; déduplication.

---

## 25. Queue

La technologie de queue doit rester proportionnée.

Choix initial recommandé : queue PostgreSQL ou Redis selon les besoins validés ; pas de Kafka par défaut.

Une queue doit supporter : retries ; backoff ; délais ; concurrence ; visibilité des jobs ; Dead Letter ; monitoring ; arrêt contrôlé.

Le choix précis doit faire l'objet d'un ADR si structurant.

---

## 26. Redis

Redis est optionnel.

Il peut être utilisé pour : cache ; rate limiting ; verrou court ; queue ; sessions selon stratégie ; coordination éphémère.

Redis ne doit pas devenir la source autoritative d'une donnée métier critique.

Toute utilisation doit définir : tenant scope ; clé ; TTL ; invalidation ; comportement en panne ; métriques ; confidentialité.

---

## 27. Cache

Le cache n'est introduit qu'après identification d'un besoin mesuré.

Chaque cache définit :

```text
Source of truth
Key
Tenant scope
TTL
Invalidation
Consistency model
Sensitive data policy
Failure behavior
Metrics
```

Exemple de clé :

```text
organization:{organizationId}:tender:{tenderId}:summary:v1
```

Une clé tenant-scoped sans `organizationId` est interdite.

---

## 28. Stockage de fichiers

Les fichiers sont stockés dans un Object Storage derrière un port.

Exemple :

```typescript
interface ObjectStorage {
  createUploadUrl(input: {
    organizationId: string;
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string>;

  createDownloadUrl(input: {
    organizationId: string;
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<string>;
}
```

Les chemins de stockage incluent le tenant.

Exemple :

```text
organizations/{organizationId}/documents/{documentId}/versions/{versionId}
```

### 28.1 Pipeline d'upload

```text
Authorize
→ Create Upload Session
→ Upload
→ Confirm
→ Validate MIME
→ Verify Size
→ Checksum
→ Antivirus
→ Persist Version
→ Queue Processing
```

Les fichiers sont considérés hostiles.

Ils ne doivent pas être indexés ou traités avant validation.

### 28.2 URLs signées

Les URLs signées doivent être : de courte durée ; générées après autorisation ; limitées à une opération ; absentes des logs ; non persistées durablement ; renouvelées après une nouvelle vérification.

---

## 29. Documents

Une version documentaire est immuable.

Le modèle doit distinguer :

```text
Document
DocumentVersion
StoredObject
ProcessingRun
ExtractedContent
Chunk
Embedding
```

Une citation doit référencer une version immuable.

L'identifiant du document seul n'est pas suffisant si le contenu peut changer.

---

## 30. Recherche

La recherche initiale privilégie PostgreSQL.

Capacités possibles : filtres structurés ; full-text search ; trigrammes ; ranking ; pgvector ; recherche hybride.

OpenSearch ou un moteur dédié ne sont ajoutés qu'après démonstration d'une insuffisance réelle.

Toute recherche doit appliquer : tenant filter ; permission filter ; Workspace filter ; confidentialité ; suppression ; version active.

---

## 31. AI Gateway

Tout appel IA passe par l'AI Gateway.

Interface conceptuelle :

```typescript
interface AIGateway {
  execute<TInput, TOutput>(input: {
    organizationId: string;
    actorId: string;
    skill: string;
    skillVersion: string;
    operation: string;
    data: TInput;
    outputSchema: unknown;
    confidentialityLevel: string;
    correlationId: string;
  }): Promise<TOutput>;
}
```

Le Gateway gère : modèle ; fournisseur ; politique ; prompts ; contexte ; permissions ; validation ; retries ; fallback ; coût ; traces ; AI Runs ; redaction ; sécurité.

---

## 32. RAG

Pipeline :

```text
Authorize
→ Select Corpus
→ Filter Tenant
→ Filter Workspace
→ Filter Confidentiality
→ Retrieve
→ Rerank
→ Build Context
→ Invoke Model
→ Validate Output
→ Validate Citations
→ Persist AI Run
```

Les permissions sont appliquées avant le retrieval.

Les documents sont des données non fiables, pas des instructions.

### 32.1 Métadonnées de chunk

Chaque chunk doit inclure au minimum :

```text
organizationId
workspaceId
documentId
documentVersionId
chunkId
pageNumber
section
confidentialityLevel
createdAt
deletedAt
embeddingVersion
```

Une recherche sans filtre tenant est interdite.

---

## 33. AI Runs

Toute opération IA significative doit créer un AI Run.

Champs recommandés :

```text
id
organizationId
workspaceId
actorId
skill
skillVersion
operation
provider
model
status
inputFingerprint
promptVersion
outputSchemaVersion
startedAt
completedAt
inputTokens
outputTokens
estimatedCost
correlationId
errorCode
reviewStatus
```

Les payloads complets ne sont stockés que si une politique explicite l'autorise.

---

## 34. Sorties IA

Les sorties machine doivent être structurées et validées.

Pipeline :

```text
Parse
→ Schema Validation
→ Business Validation
→ Permission Validation
→ Citation Validation
→ Persistence
```

Une sortie invalide ne doit jamais être traitée comme valide.

Une information non sourcée doit être : rejetée ; marquée ; ou soumise à validation humaine ; selon le workflow.

---

## 35. Agents

Les agents sont des capacités bornées.

Chaque agent doit définir : mission ; outils autorisés ; outils interdits ; nombre maximal d'étapes ; timeout ; budget ; tenant ; permissions ; conditions d'arrêt ; validation humaine ; format de sortie.

Les outils suivants sont interdits par défaut : SQL arbitraire ; suppression ; modification de permission ; soumission externe ; lecture de secrets ; exécution système ; accès inter-tenant.

---

## 36. Observabilité

Platform Foundation fournit une couche d'observabilité partagée.

Elle comprend : logs structurés ; métriques ; traces ; correlation IDs ; dashboards ; alertes ; health checks ; runbooks.

Un workflow critique doit être observable de bout en bout.

### 36.1 Logs

Champs recommandés :

```text
timestamp
level
service
environment
requestId
correlationId
organizationId
actorId
operation
resourceType
resourceId
durationMs
status
errorCode
```

Sont interdits : secrets ; tokens ; URLs signées ; documents complets ; prompts complets sans politique ; données personnelles inutiles ; payloads bruts sensibles.

### 36.2 Métriques

Métriques communes : requêtes ; erreurs ; latence ; saturation ; jobs en attente ; retries ; Dead Letters ; temps de traitement ; usage IA ; coûts IA ; stockage ; taux de cache ; erreurs de permission ; erreurs tenant.

Les labels ne doivent pas créer une cardinalité incontrôlée.

### 36.3 Traces

Les traces relient :

```text
HTTP Request
→ Use Case
→ Database
→ Outbox
→ Worker
→ External Provider
```

Les données sensibles ne doivent pas être ajoutées comme attributs de trace.

---

## 37. Health checks

Minimum :

```text
/live
/ready
```

`/live` indique que le processus fonctionne.

`/ready` indique que le service peut accepter du trafic.

Les checks peuvent inclure : base ; queue ; configuration critique ; stockage ; dépendances essentielles.

Une dépendance optionnelle ne doit pas nécessairement rendre le service non ready.

---

## 38. Configuration

La configuration doit être : validée au démarrage ; typée ; documentée ; séparée par environnement ; sans secret dans Git ; accessible via un port ou module dédié.

Exemple :

```typescript
const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  DATABASE_URL: z.string().min(1),
  APP_BASE_URL: z.string().url(),
});
```

L'application doit refuser de démarrer si une configuration critique est invalide.

---

## 39. Secrets

Les secrets proviennent d'un secret manager ou du mécanisme sécurisé de la plateforme.

Ils ne doivent jamais apparaître dans : code ; Git ; logs ; tests ; prompts ; documentation ; erreurs ; événements ; images de conteneur.

Tout secret exposé doit être considéré compromis et remplacé.

---

## 40. Feature flags

Toute feature flag possède : nom ; propriétaire ; objectif ; valeur par défaut ; stratégie de rollout ; stratégie de rollback ; métriques ; date de suppression ; comportement par tenant si applicable.

Une feature flag ne peut pas contourner : une permission ; une règle métier ; un contrôle de sécurité.

---

## 41. Sécurité

La sécurité est intégrée à toutes les couches.

Platform Foundation doit fournir : authentification sécurisée ; autorisation ; validation ; protection IDOR ; CORS ; CSRF selon contexte ; rate limiting ; headers de sécurité ; gestion des secrets ; protection des uploads ; chiffrement ; audit ; scans ; dépendances contrôlées ; redaction ; protection SSRF ; vérification de webhooks.

### 41.1 Secure by default

Par défaut : toute route est privée ; toute donnée est tenant-scoped ; tout fichier est privé ; tout outil agentique est interdit ; toute permission est minimale ; tout log est redacted ; toute sortie IA exige validation ; toute intégration externe a un timeout.

L'ouverture est explicite.

---

## 42. Webhooks

Les webhooks entrants doivent être : signés ; datés ; protégés contre le replay ; validés ; idempotents ; traités de manière asynchrone ; tenant-scoped ; auditables.

Les webhooks sortants doivent avoir : signature ; version ; identifiant de livraison ; retry borné ; timeout ; historique ; Dead Letter ; rotation de secret.

---

## 43. Email et notifications

Les notifications passent par un port.

Exemple :

```typescript
interface NotificationSender {
  send(input: {
    organizationId: string;
    recipientId: string;
    template: string;
    locale: string;
    variables: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<void>;
}
```

Les envois sont généralement asynchrones.

Une panne email ne doit pas annuler une transaction métier déjà validée.

---

## 44. Audit

L'audit est distinct des logs.

Un Audit Record doit inclure :

```text
organizationId
actorId
action
resourceType
resourceId
occurredAt
result
metadata minimale
correlationId
```

L'audit doit être : durable ; protégé ; consultable selon permission ; généré dans la transaction lorsque nécessaire ; exempt de secrets.

---

## 45. Testing Foundation

Platform Foundation fournit : factories ; fixtures ; fake clock ; fake UUID generator ; fake providers ; base de test isolée ; helpers multi-tenant ; helpers auth ; helpers API ; fake AI Gateway ; fake Object Storage ; fake Event Bus.

Les tests doivent pouvoir exécuter le Domain et les use cases sans NestJS complet lorsque possible.

### 45.1 Priorités de test

Ordre :

```text
1. Business Rules
2. Permissions
3. Tenant Isolation
4. Transactions
5. Data Integrity
6. Contracts
7. Idempotency
8. Async Processing
9. AI Validation
10. Observability Hooks
```

### 45.2 Tests multi-tenant

Chaque module tenant-scoped doit tester : lecture autre tenant ; modification autre tenant ; suppression autre tenant ; cache autre tenant ; fichier autre tenant ; worker autre tenant ; recherche autre tenant ; RAG autre tenant.

Une fuite potentielle est un blocker.

---

## 46. CI

Pipeline minimum :

```text
Install
→ Format Check
→ Lint
→ Type Check
→ Unit Tests
→ Integration Tests
→ Build
→ Migration Validation
→ Security Scan
```

Selon le changement :

```text
Contract Tests
E2E Tests
OpenAPI Diff
Container Scan
License Check
AI Evaluations
Performance Tests
```

Aucun contrôle critique ne doit être ignoré silencieusement.

---

## 47. Docker

Les applications doivent être conteneurisables.

Principes : builds multi-stage ; image minimale ; utilisateur non-root ; dépendances verrouillées ; secrets injectés au runtime ; health checks ; signal handling ; arrêt gracieux ; pas de fichiers temporaires non maîtrisés.

L'image ne doit pas contenir : secrets ; fichiers de développement inutiles ; caches de package ; credentials ; données de test sensibles.

---

## 48. Déploiement

Le déploiement doit être : automatisé ; reproductible ; observable ; réversible ; compatible avec les migrations ; séparé par environnement.

Flux recommandé :

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

### 48.1 Environnements

Minimum recommandé :

```text
local
test
staging
production
```

Chaque environnement doit avoir : configuration séparée ; secrets séparés ; données séparées ; ressources séparées ; accès limité ; observabilité adaptée.

Les données de production ne doivent pas être copiées dans les environnements inférieurs sans procédure de minimisation et d'anonymisation.

---

## 49. Rollback

Chaque déploiement significatif doit définir : condition de rollback ; version précédente ; compatibilité DB ; gestion des jobs en cours ; gestion des messages ; gestion des nouvelles écritures ; stratégie feature flag ; vérifications post-rollback.

Si le rollback est impossible, un forward-fix doit être préparé et le risque explicitement accepté.

---

## 50. Kubernetes

Kubernetes n'est pas une exigence initiale.

Il ne doit être introduit que si des besoins démontrés apparaissent : orchestration complexe ; nombreux services ; contraintes fortes de disponibilité ; besoin de scheduling avancé ; standard imposé par l'environnement ; équipe capable de l'exploiter.

Son introduction nécessite : approbation niveau 3 ; ADR ; analyse de coûts ; runbooks ; stratégie de sécurité ; stratégie de sauvegarde ; compétences d'exploitation.

---

## 51. Scalabilité

La plateforme doit pouvoir évoluer sans introduire prématurément une architecture distribuée.

Ordre recommandé :

```text
Optimize queries
→ Add indexes
→ Add pagination
→ Add async processing
→ Add caching
→ Scale application replicas
→ Separate workers
→ Introduce specialized infrastructure only if measured
```

La scalabilité doit être fondée sur des mesures.

---

## 52. Performance

Platform Foundation définit : budgets de latence ; limites de payload ; limites de page ; limites de fichier ; limites de job ; limites de tokens ; limites de concurrence ; métriques de saturation.

Aucune optimisation ne doit réduire : sécurité ; intégrité ; isolation tenant ; observabilité ; maintenabilité ; sans approbation explicite.

---

## 53. Résilience

Toute dépendance externe doit avoir : timeout ; retry borné ; backoff ; classification des erreurs ; circuit breaker si nécessaire ; fallback si sûr ; métriques ; logs ; stratégie de reprise.

Une dépendance optionnelle doit pouvoir se dégrader sans bloquer le cœur métier.

---

## 54. Suppression de données

La suppression doit traiter : base ; fichiers ; versions ; chunks ; embeddings ; caches ; exports ; résultats IA ; projections ; fournisseurs externes ; sauvegardes selon politique.

Elle doit être : autorisée ; tenant-scoped ; auditée ; idempotente ; reprenable ; vérifiable.

La suppression physique n'est pas toujours immédiate.

Elle doit respecter les règles de rétention.

---

## 55. Sauvegardes

La stratégie de sauvegarde doit définir : fréquence ; chiffrement ; rétention ; RPO ; RTO ; accès ; restauration ; tests de restauration ; responsabilités.

Une sauvegarde non restaurée périodiquement n'est pas considérée comme vérifiée.

---

## 56. Developer Experience

Platform Foundation doit réduire le coût cognitif du développement.

Il fournit : scripts cohérents ; conventions ; templates ; exemples ; generators limités ; environnements locaux reproductibles ; fixtures ; seed contrôlé ; messages d'erreur utiles ; documentation ; commandes de validation.

Exemples de commandes :

```bash
pnpm dev
pnpm test
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
pnpm db:migrate
pnpm db:validate
```

---

## 57. Générateurs et templates

Les générateurs peuvent créer : structure d'un module ; use case ; controller ; repository ; test ; migration ; event ; worker.

Ils ne doivent pas : générer de règles métier ; créer des permissions ; introduire des champs arbitraires ; masquer l'architecture ; produire du code inutile.

Le code généré doit rester lisible et modifiable.

---

## 58. Shared Kernel

Le Shared Kernel est minimal.

Il peut contenir : identifiants ; résultat générique limité ; horloge ; primitives d'événements ; erreurs techniques communes ; types de pagination ; contexte d'exécution ; utilitaires de test.

Il ne doit pas contenir : règles métier transversales mal définies ; generic repositories ; services universels ; enums de tous les modules ; modèles Prisma ; logique métier partagée sans propriétaire.

---

## 59. Contrats inter-modules

Un module expose uniquement ce qui est nécessaire.

Formes possibles : use case public ; query publique ; événement ; projection ; port ; contrat DTO stable.

Un module ne doit pas importer : les tables privées d'un autre module ; ses repositories internes ; ses entités pour les modifier ; ses mappers ; ses controllers.

---

## 60. Concurrence

Pour les ressources sensibles, Platform Foundation fournit : version optimiste ; contrôle `If-Match` ; erreurs de conflit ; transactions ; contraintes uniques ; verrous courts si nécessaires.

Une écriture concurrente ne doit pas écraser silencieusement une décision utilisateur critique.

---

## 61. Idempotency Keys

Les opérations sensibles ou rejouables peuvent accepter une clé d'idempotence.

Exemples : création ; génération de package ; lancement IA ; import ; webhook ; export ; synchronisation.

Le stockage d'idempotence doit être : tenant-scoped ; lié à l'opération ; lié à l'acteur si nécessaire ; expiré selon politique ; capable de retourner le résultat précédent.

---

## 62. Internationalisation

La plateforme doit séparer :

```text
Stable internal code
+
Localized user message
```

Les codes d'erreur ne sont pas traduits.

Les messages utilisateur peuvent être localisés.

Les dates, montants et devises doivent conserver leur sémantique.

---

## 63. Dates et temps

Les timestamps techniques sont stockés en UTC.

Les échéances officielles conservent : instant ; fuseau officiel ; représentation d'origine si nécessaire.

Le Domain utilise une abstraction de temps :

```typescript
interface Clock {
  now(): Date;
}
```

Les tests ne doivent pas dépendre de l'horloge réelle.

---

## 64. Montants

Les montants utilisent un type décimal.

Les contrats JSON sérialisent les montants en chaînes.

Exemple :

```json
{
  "amount": "150000.0000",
  "currency": "EUR"
}
```

Une devise ne doit jamais être implicite.

Les règles d'arrondi doivent être explicites.

---

## 65. Erreurs

Les erreurs sont classées :

```text
Validation
Authentication
Authorization
Not Found
Business Conflict
Concurrency Conflict
Rate Limit
External Dependency
Internal
```

Chaque erreur attendue doit avoir : code ; catégorie ; statut HTTP si applicable ; message sûr ; metadata minimale ; tests.

Les erreurs internes ne doivent pas exposer : stack traces ; requêtes SQL ; noms de tables ; secrets ; informations inter-tenant.

---

## 66. Rate limiting

Le rate limiting doit être appliqué selon : IP ; acteur ; tenant ; opération ; coût ; sensibilité.

Les opérations IA et fichiers peuvent avoir des limites spécifiques.

Une limite dépassée produit une réponse explicite et observable.

---

## 67. Quotas

Les quotas possibles incluent : nombre d'utilisateurs ; stockage ; taille de fichier ; nombre de documents ; AI Runs ; tokens ; exports ; webhooks ; jobs concurrents.

Les quotas sont appliqués côté serveur.

Ils ne doivent pas être contournés par le frontend ou les workers.

---

## 68. Confidentialité

Chaque donnée sensible doit pouvoir avoir un niveau de confidentialité.

Ce niveau peut influencer : permissions ; stockage ; logs ; retrieval ; fournisseur IA ; région ; export ; partage ; durée de conservation.

Le niveau ne doit pas être confié au modèle IA pour application.

---

## 69. SLO et fiabilité

Les objectifs de fiabilité doivent être définis avant d'introduire une infrastructure complexe.

Exemples de mesures : disponibilité API ; latence ; taux de réussite jobs ; délai de traitement documents ; taux d'échec IA ; délai de publication Outbox.

Un SLO doit être : mesurable ; lié à un workflow ; accompagné d'alertes ; proportionné à la maturité du produit.

---

## 70. Documentation attendue

Platform Foundation doit maintenir :

```text
ARCHITECTURE_RULES.md
MODULE_TEMPLATE.md
DATABASE_PATTERNS.md
API_PATTERNS.md
FRONTEND_PATTERNS.md
AI_PATTERNS.md
TESTING_PATTERNS.md
DEPLOYMENT_PATTERNS.md
SECURITY_PATTERNS.md
REVIEW_CHECKLIST.md
```

Il peut également produire : ADR ; runbooks ; guides de migration ; guides de développement ; diagrammes ; exemples de référence.

Les documents spécialisés ne doivent pas contredire ce Skill.

---

## 71. Workflow d'une mission Platform Foundation

Toute mission suit :

```text
Understand
→ Inspect
→ Classify
→ Design
→ Validate
→ Implement
→ Test
→ Review
→ Document
→ Report
```

### 71.1 Understand

Identifier : objectif ; besoin plateforme ; consommateurs ; contraintes ; documents ; risques ; critères d'acceptation.

### 71.2 Inspect

Inspecter : architecture existante ; modules concernés ; dépendances ; tests ; migrations ; configuration ; observabilité ; incidents connus ; ADR.

### 71.3 Classify

Classer les décisions selon : impact ; réversibilité ; sécurité ; données ; coût ; architecture ; contrat ; exploitation.

### 71.4 Design

Produire une conception contenant : responsabilité ; frontières ; ports ; adapters ; données ; transactions ; tenant ; permissions ; événements ; erreurs ; tests ; observabilité ; migration ; rollback.

### 71.5 Validate

Vérifier : conformité documentaire ; absence de contradiction ; absence de décision métier implicite ; niveau d'autorité ; simplicité ; faisabilité ; sécurité ; production readiness.

### 71.6 Implement

Implémenter par petits incréments.

Préférer un vertical slice complet.

Éviter les abstractions sans consommateur réel.

### 71.7 Test

Tester : nominal ; refus ; tenant ; permission ; erreurs ; concurrence ; idempotence ; dépendances ; migrations ; observabilité.

### 71.8 Review

Relire : architecture ; sécurité ; données ; coût ; performance ; exploitation ; documentation ; diff complet.

### 71.9 Document

Mettre à jour : Skill spécialisé ; architecture ; ADR ; runbook ; API ; schéma ; configuration ; commandes.

### 71.10 Report

Produire un rapport factuel.

---

## 72. Rapport de mission

Format recommandé :

```markdown
## Platform Foundation Mission Report

### Objective

### Scope

### Architecture impact

### Components created or modified

### Decisions and autonomy levels

### Multi-tenancy

### Security

### Data and migrations

### API and contracts

### Async processing

### AI impact

### Observability

### Tests executed

### Results

### Items not verified

### Risks

### Rollback

### Documentation updated

### Remaining actions

### Approvals required
```

---

## 73. Conditions d'arrêt

Platform Foundation doit arrêter la mission concernée si : une règle métier est absente ; une permission est ambiguë ; un tenant scope n'est pas définissable ; une contradiction documentaire existe ; une migration destructive n'est pas approuvée ; un contrat doit être rompu sans stratégie ; une technologie structurante n'est pas approuvée ; une fuite inter-tenant est possible ; une donnée sensible serait exposée ; un secret est découvert ; une action autonome IA est demandée ; une vérification critique est impossible ; un test critique échoue ; la demande implique de masquer un risque.

---

## 74. Anti-patterns

Platform Foundation doit refuser :

```text
Business logic in controllers
Prisma in Domain
Prisma models in API responses
Generic repository for everything
Hidden tenant context
Frontend-only authorization
Direct provider calls
Direct LLM calls
Long external calls inside transactions
Retries without idempotency
Unbounded jobs
Unbounded agent loops
Unsigned webhooks
Public files by default
Cache without tenant
Cache without invalidation
Silent breaking changes
Destructive migrations in one step
Microservices without need
Kafka by anticipation
Kubernetes by fashion
OpenSearch without measurements
Logs containing payloads or secrets
Tests depending on real AI
Production data copied casually
Unversioned events
Unversioned prompts
Invented citations
Exactly-once claims without proof
```

---

## 75. Definition of Ready

Une mission Platform Foundation est prête lorsque : le besoin est clair ; les consommateurs sont identifiés ; les documents applicables existent ; les permissions sont définies ; le tenant scope est clair ; les données sont comprises ; les risques sont évalués ; les décisions niveau 3 sont approuvées ; les critères d'acceptation sont définis ; la stratégie de test est connue.

---

## 76. Definition of Done

Une mission est terminée lorsque :

```text
Architecture is coherent
+
Boundaries are respected
+
Tenant isolation is enforced
+
Security is verified
+
Data integrity is preserved
+
Contracts are stable
+
Async work is idempotent
+
Observability exists
+
Tests pass
+
Build passes
+
Migrations are safe
+
Documentation is current
+
Rollback is understood
+
Report is honest
```

---

## 77. Checklist condensée avant implémentation

- [ ] Documents lus.
- [ ] Objectif compris.
- [ ] Consommateurs identifiés.
- [ ] Niveau de décision classé.
- [ ] Permissions comprises.
- [ ] Tenant scope explicite.
- [ ] Données comprises.
- [ ] Frontières définies.
- [ ] Ports définis.
- [ ] Transactions définies.
- [ ] Événements définis.
- [ ] Stratégie async définie.
- [ ] Sécurité évaluée.
- [ ] Tests planifiés.
- [ ] Observabilité planifiée.
- [ ] Migration et rollback compris.

---

## 78. Checklist condensée avant livraison

- [ ] Domain indépendant.
- [ ] Controllers fins.
- [ ] Prisma isolé.
- [ ] Tenant partout.
- [ ] Permissions serveur.
- [ ] Validation des frontières.
- [ ] Contraintes DB.
- [ ] Migrations sûres.
- [ ] Idempotence.
- [ ] Timeouts.
- [ ] Retries bornés.
- [ ] Dead Letter.
- [ ] Logs sûrs.
- [ ] Métriques.
- [ ] Tests négatifs.
- [ ] Tests multi-tenant.
- [ ] Build.
- [ ] Documentation.
- [ ] Rapport.
- [ ] Aucun blocage masqué.

---

## 79. Critères d'acceptation du Skill

Ce Skill est correctement appliqué lorsque :

- les modules partagent une architecture cohérente ;
- le Domain reste indépendant ;
- les composants techniques sont réutilisables sans devenir génériques à l'excès ;
- les contrôleurs restent fins ;
- Prisma reste dans l'Infrastructure ;
- le tenant scope traverse toutes les couches ;
- les permissions restent appliquées côté serveur ;
- les migrations sont progressives ;
- les événements utilisent une Outbox lorsque nécessaire ;
- les workers sont idempotents ;
- les fichiers restent privés ;
- les appels IA passent par l'AI Gateway ;
- les sorties IA sont validées ;
- les workflows critiques sont observables ;
- les tests couvrent les refus et l'isolation ;
- les déploiements sont réversibles ;
- la complexité reste proportionnée au produit.

## Arborescence mise à jour

```text
skills/
├── engineering-governor/
│   ├── SKILL.md
│   ├── RESPONSIBILITIES.md
│   ├── DECISION_MATRIX.md
│   ├── ENGINEERING_PRINCIPLES.md
│   └── CHECKLIST.md
└── platform-foundation/
    └── SKILL.md
```
