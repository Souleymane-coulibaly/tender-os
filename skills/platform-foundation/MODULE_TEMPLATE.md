# TenderOS — Module Template

Version : 1.0
Statut : Draft
Rôle concerné : Platform Foundation
Document parent : `skills/platform-foundation/SKILL.md`
Règles associées : `skills/platform-foundation/ARCHITECTURE_RULES.md`

---

## 1. Objectif

Ce document définit le template officiel de création et d'évolution des modules TenderOS.

Il normalise : les frontières d'un module ; son arborescence ; ses conventions de nommage ; ses agrégats ; ses use cases ; ses repositories ; ses transactions ; ses controllers ; ses presenters ; ses événements ; ses workers ; ses tests ; son assemblage NestJS ; sa documentation ; ses critères de livraison.

Ce template constitue une référence.

Il doit être adapté à la complexité réelle du module.

Il ne doit pas conduire à créer : des dossiers vides ; des couches inutiles ; des interfaces sans frontière réelle ; des abstractions prématurées ; des composants sans consommateur.

---

## 2. Principes du template

Tout module doit respecter les principes suivants :

```text
One clear owner
+
One explicit responsibility
+
Private implementation
+
Minimal public API
+
Explicit tenant scope
+
Server-side permissions
+
Domain-owned invariants
+
Application-owned orchestration
+
Infrastructure isolation
+
Thin interfaces
+
Reliable events
+
Observable operations
+
Behavior-focused tests
```

---

## 3. Définition d'un module

Un module TenderOS représente une capacité cohérente de la plateforme.

Un module doit posséder : une responsabilité principale ; un vocabulaire métier identifiable ; un propriétaire de données ; des frontières explicites ; une API publique minimale ; une documentation locale ; une stratégie de test.

Exemples de modules métier :

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
```

Exemples de modules de plateforme :

```text
Audit
Notifications
Files
Search
AI
Feature Flags
Observability
```

---

## 4. Critères de création d'un module

Créer un module lorsqu'au moins plusieurs critères suivants sont réunis : il possède un vocabulaire métier propre ; il protège des invariants propres ; il possède des données dont il est propriétaire ; il expose des use cases cohérents ; il publie des événements significatifs ; il évolue avec une certaine indépendance ; il possède des règles de permissions propres ; il constitue une capacité technique clairement isolable.

Ne pas créer un module uniquement parce que : une table existe ; une route existe ; un composant frontend existe ; un service technique contient plusieurs méthodes ; un nom semble constituer une catégorie.

---

## 5. Fiche d'identité du module

Chaque module doit disposer d'une fiche d'identité dans son README local.

Template :

```markdown
# Module: Tenders

## Responsibility

Décrire la responsabilité unique du module.

## Owns

- Tender
- Tender source metadata
- Tender lifecycle
- Tender domain history

## Does not own

- Organization memberships
- Workspace documents
- Proposal content
- Submission transmission

## Public capabilities

- Create manual tender
- Import tender
- Shortlist tender
- Archive tender
- Record go/no-go decision

## Public events

- TenderCreated
- TenderShortlisted
- TenderArchived
- GoNoGoDecisionRecorded

## Dependencies

- Organizations
- Memberships
- Audit
- Outbox

## Tenant scope

Organization

## Main aggregate

Tender

## Data classification

Internal business data

## Critical permissions

- tender:create
- tender:read
- tender:shortlist
- tender:archive

## Operational owner

Platform / Product team
```

---

## 6. Arborescence de référence

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
    │   ├── policies/
    │   └── repositories/
    ├── application/
    │   ├── commands/
    │   ├── queries/
    │   ├── use-cases/
    │   ├── results/
    │   ├── policies/
    │   ├── ports/
    │   └── services/
    ├── infrastructure/
    │   ├── persistence/
    │   │   ├── prisma/
    │   │   ├── mappers/
    │   │   └── repositories/
    │   ├── messaging/
    │   ├── external/
    │   ├── storage/
    │   └── configuration/
    ├── interfaces/
    │   ├── http/
    │   │   ├── controllers/
    │   │   ├── schemas/
    │   │   ├── presenters/
    │   │   └── mappers/
    │   ├── consumers/
    │   ├── workers/
    │   ├── webhooks/
    │   └── cli/
    ├── contracts/
    │   ├── commands/
    │   ├── queries/
    │   ├── events/
    │   └── responses/
    ├── tests/
    │   ├── unit/
    │   ├── integration/
    │   ├── contract/
    │   ├── architecture/
    │   ├── e2e/
    │   ├── factories/
    │   └── fixtures/
    ├── README.md
    ├── index.ts
    └── tender.module.ts
```

Tous les dossiers ne sont pas obligatoires.

Un dossier doit être créé uniquement lorsqu'il contient une responsabilité réelle.

---

## 7. Variante minimale

Pour un module simple :

```text
modules/
└── notifications/
    ├── application/
    │   ├── use-cases/
    │   └── ports/
    ├── infrastructure/
    │   └── adapters/
    ├── interfaces/
    │   └── consumers/
    ├── tests/
    ├── README.md
    ├── index.ts
    └── notification.module.ts
```

Un module technique sans Domain riche ne doit pas simuler artificiellement des agrégats ou des Value Objects.

---

## 8. Convention de nommage générale

Les noms utilisent le langage métier défini dans `bible/02-product/ubiquitous-language.md`.

### 8.1 Modules

```text
tenders
workspaces
documents
proposals
submissions
```

### 8.2 Agrégats et entités

```text
Tender
Workspace
Document
DocumentVersion
Proposal
Submission
```

### 8.3 Use cases

```text
CreateManualTenderUseCase
ImportTenderUseCase
ShortlistTenderUseCase
ArchiveTenderUseCase
RecordGoNoGoDecisionUseCase
```

### 8.4 Commands

```text
CreateManualTenderCommand
ShortlistTenderCommand
ArchiveTenderCommand
```

### 8.5 Queries

```text
GetTenderByIdQuery
ListTendersQuery
SearchTenderDocumentsQuery
```

### 8.6 Repositories

```text
TenderRepository
PrismaTenderRepository
InMemoryTenderRepository
```

### 8.7 Ports

```text
TenderSourceImporter
TenderReferenceGenerator
ObjectStorage
AIGateway
```

### 8.8 Controllers

```text
TenderCommandController
TenderQueryController
TenderAdminController
```

Un contrôleur unique `TenderController` reste acceptable si sa taille est limitée.

### 8.9 Presenters

```text
TenderDetailPresenter
TenderListItemPresenter
CreateTenderPresenter
```

### 8.10 Événements

Les événements utilisent le passé :

```text
TenderCreated
TenderShortlisted
TenderArchived
GoNoGoDecisionRecorded
```

### 8.11 Erreurs

```text
TenderNotFoundError
TenderInvalidStateError
TenderReferenceAlreadyExistsError
TenderVersionConflictError
```

### 8.12 Policies

```text
TenderAuthorizationPolicy
TenderVisibilityPolicy
TenderQualificationPolicy
```

---

## 9. Convention des fichiers

Utiliser une convention stable dans l'ensemble du dépôt.

Exemple recommandé :

```text
tender.aggregate.ts
tender-id.value-object.ts
tender-created.event.ts
shortlist-tender.use-case.ts
shortlist-tender.command.ts
tender.repository.ts
prisma-tender.repository.ts
tender.persistence-mapper.ts
tender-detail.presenter.ts
tender-command.controller.ts
```

Éviter :

```text
service.ts
helper.ts
utils.ts
manager.ts
processor.ts
handler.ts
common.ts
misc.ts
```

sauf lorsque le nom complet exprime clairement la responsabilité.

---

## 10. API publique du module

Le fichier `index.ts` expose uniquement les capacités autorisées.

Exemple :

```typescript
export {
  CreateManualTenderUseCase,
  ShortlistTenderUseCase,
  ArchiveTenderUseCase,
} from "./application/use-cases";

export type {
  TenderSummary,
  TenderDetails,
} from "./contracts/responses";

export type {
  TenderCreatedEvent,
  TenderShortlistedEvent,
} from "./contracts/events";

export { TenderModule } from "./tender.module";
```

Ne pas exposer : repositories Prisma ; mappers privés ; entités mutables ; services internes ; modèles de persistance ; transactions techniques ; configuration privée.

---

## 11. Structure du Domain

Le Domain contient les comportements et règles qui restent vrais indépendamment : de l'interface ; de la base ; du framework ; du fournisseur ; de l'environnement d'exécution.

Structure type :

```text
domain/
├── aggregates/
│   └── tender.aggregate.ts
├── entities/
│   └── tender-source.entity.ts
├── value-objects/
│   ├── tender-id.value-object.ts
│   ├── tender-reference.value-object.ts
│   └── official-deadline.value-object.ts
├── events/
│   ├── tender-created.event.ts
│   └── tender-shortlisted.event.ts
├── errors/
│   ├── tender-invalid-state.error.ts
│   └── invalid-official-deadline.error.ts
└── services/
    └── tender-qualification-policy.ts
```

---

## 12. Template d'agrégat

Exemple conceptuel :

```typescript
type TenderProps = {
  id: TenderId;
  organizationId: OrganizationId;
  title: TenderTitle;
  reference: TenderReference;
  status: TenderStatus;
  officialDeadline?: OfficialDeadline;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export class Tender {
  private readonly domainEvents: DomainEvent[] = [];

  private constructor(private props: TenderProps) {}

  static create(input: {
    id: TenderId;
    organizationId: OrganizationId;
    title: TenderTitle;
    reference: TenderReference;
    officialDeadline?: OfficialDeadline;
    actorId: ActorId;
    occurredAt: Date;
  }): Tender {
    const tender = new Tender({
      id: input.id,
      organizationId: input.organizationId,
      title: input.title,
      reference: input.reference,
      status: TenderStatus.Discovered,
      officialDeadline: input.officialDeadline,
      version: 1,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });

    tender.record(
      new TenderCreated({
        tenderId: input.id,
        organizationId: input.organizationId,
        actorId: input.actorId,
        occurredAt: input.occurredAt,
      }),
    );

    return tender;
  }

  static rehydrate(props: TenderProps): Tender {
    return new Tender(props);
  }

  shortlist(input: {
    actorId: ActorId;
    reason?: string;
    occurredAt: Date;
  }): void {
    if (!this.canBeShortlisted()) {
      throw new TenderInvalidStateError({
        tenderId: this.props.id.value,
        currentStatus: this.props.status,
        attemptedAction: "shortlist",
      });
    }

    this.props.status = TenderStatus.Shortlisted;
    this.props.updatedAt = input.occurredAt;

    this.record(
      new TenderShortlisted({
        tenderId: this.props.id,
        organizationId: this.props.organizationId,
        actorId: input.actorId,
        reason: input.reason,
        occurredAt: input.occurredAt,
      }),
    );
  }

  private canBeShortlisted(): boolean {
    return this.props.status === TenderStatus.Discovered;
  }

  pullDomainEvents(): readonly DomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents.length = 0;
    return events;
  }

  private record(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  get id(): TenderId {
    return this.props.id;
  }

  get organizationId(): OrganizationId {
    return this.props.organizationId;
  }

  get version(): number {
    return this.props.version;
  }
}
```

---

## 13. Règles des agrégats

Un agrégat doit : posséder une factory de création contrôlée ; posséder un mécanisme de réhydratation ; protéger ses invariants ; modifier son état uniquement par des méthodes métier ; produire ses événements ; exposer un minimum d'état ; rester testable sans infrastructure.

Un agrégat ne doit pas : avoir de setters publics génériques ; accepter des `Partial<Props>` ; retourner ses propriétés mutables ; dépendre d'un repository ; appeler un service externe ; appeler l'AI Gateway ; produire une réponse HTTP ; lire une variable d'environnement.

---

## 14. Création et réhydratation

La création et la réhydratation sont distinctes.

### 14.1 `create()`

doit : vérifier les règles de création ; initialiser les valeurs ; produire les événements de création.

### 14.2 `rehydrate()`

doit : reconstruire un état déjà persisté ; ne pas produire d'événement ; ne pas appliquer de valeur par défaut modifiant l'historique ; refuser les données structurellement impossibles.

---

## 15. Value Objects

Template :

```typescript
export class TenderReference {
  private constructor(readonly value: string) {}

  static create(value: string): TenderReference {
    const normalized = value.trim().toUpperCase();

    if (normalized.length < 3 || normalized.length > 100) {
      throw new InvalidTenderReferenceError();
    }

    return new TenderReference(normalized);
  }

  equals(other: TenderReference): boolean {
    return this.value === other.value;
  }
}
```

Un Value Object doit être : immutable ; valide après construction ; comparé par sa valeur ; sans dépendance d'infrastructure ; cohérent avec le langage métier.

---

## 16. IDs typés

Les identifiants tenant-scoped ou métier importants doivent être typés.

Exemple :

```typescript
export class TenderId {
  private constructor(readonly value: string) {}

  static from(value: string): TenderId {
    if (!isUuid(value)) {
      throw new InvalidTenderIdError(value);
    }

    return new TenderId(value);
  }
}
```

Éviter de mélanger accidentellement :

```text
TenderId
WorkspaceId
OrganizationId
DocumentId
ActorId
```

---

## 17. Domain Events

Template :

```typescript
export type TenderShortlistedEventPayload = {
  tenderId: string;
  actorId: string;
  reason?: string;
};

export class TenderShortlisted implements DomainEvent {
  readonly eventId: string;
  readonly eventType = "TenderShortlisted";
  readonly eventVersion = 1;

  readonly organizationId: string;
  readonly aggregateType = "Tender";
  readonly aggregateId: string;
  readonly actorId: string;
  readonly occurredAt: Date;
  readonly payload: TenderShortlistedEventPayload;

  constructor(input: {
    eventId: string;
    organizationId: string;
    tenderId: string;
    actorId: string;
    reason?: string;
    occurredAt: Date;
  }) {
    this.eventId = input.eventId;
    this.organizationId = input.organizationId;
    this.aggregateId = input.tenderId;
    this.actorId = input.actorId;
    this.occurredAt = input.occurredAt;
    this.payload = {
      tenderId: input.tenderId,
      actorId: input.actorId,
      reason: input.reason,
    };
  }
}
```

Un événement doit contenir uniquement les données nécessaires à ses consommateurs autorisés.

---

## 18. Erreurs du Domain

Template :

```typescript
export class TenderInvalidStateError extends DomainError {
  readonly code = "INVALID_TENDER_STATUS_TRANSITION";

  constructor(input: {
    tenderId: string;
    currentStatus: TenderStatus;
    attemptedAction: string;
  }) {
    super("The tender is not in a valid state for this action.", {
      tenderId: input.tenderId,
      currentStatus: input.currentStatus,
      attemptedAction: input.attemptedAction,
    });
  }
}
```

Les erreurs du Domain ne doivent pas contenir : de statut HTTP ; de détails Prisma ; de stack destinée au client ; de message localisé ; de secret ; de données personnelles inutiles.

---

## 19. Structure Application

```text
application/
├── commands/
│   ├── create-manual-tender.command.ts
│   └── shortlist-tender.command.ts
├── queries/
│   ├── get-tender-by-id.query.ts
│   └── list-tenders.query.ts
├── use-cases/
│   ├── create-manual-tender.use-case.ts
│   └── shortlist-tender.use-case.ts
├── policies/
│   └── tender-authorization.policy.ts
├── ports/
│   ├── transaction-manager.port.ts
│   └── tender-reference-generator.port.ts
└── results/
    ├── create-tender.result.ts
    └── shortlist-tender.result.ts
```

---

## 20. Template de Command

```typescript
export type ShortlistTenderCommand = Readonly<{
  organizationId: string;
  actorId: string;
  tenderId: string;
  reason?: string;
  expectedVersion?: number;
  requestId: string;
  correlationId: string;
}>;
```

Une Command doit : être immutable ; inclure le tenant ; inclure l'acteur ; exprimer une intention ; éviter les structures génériques ; inclure la version attendue si nécessaire ; inclure une idempotency key pour une action rejouable.

---

## 21. Template de Query

```typescript
export type GetTenderByIdQuery = Readonly<{
  organizationId: string;
  actorId: string;
  tenderId: string;
}>;
```

Pour une collection :

```typescript
export type ListTendersQuery = Readonly<{
  organizationId: string;
  actorId: string;
  status?: TenderStatusContract;
  search?: string;
  cursor?: string;
  limit: number;
  sort: TenderSortContract;
}>;
```

---

## 22. Ordre officiel d'un use case de commande

```text
1. Validate command assumptions
2. Resolve execution context
3. Verify membership
4. Verify permission
5. Load tenant-scoped resource
6. Verify application preconditions
7. Execute Domain behavior
8. Persist state
9. Persist audit
10. Persist Outbox
11. Persist idempotency result if required
12. Commit
13. Return typed result
```

Cet ordre peut varier légèrement lorsque la cohérence le justifie.

Les contrôles de permission doivent intervenir avant toute exposition de données sensibles.

---

## 23. Template de use case

```typescript
export class ShortlistTenderUseCase {
  constructor(
    private readonly transactionManager: TransactionManager,
    private readonly tenderRepository: TenderRepository,
    private readonly authorizationPolicy: TenderAuthorizationPolicy,
    private readonly auditWriter: AuditWriter,
    private readonly outboxWriter: OutboxWriter,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: ShortlistTenderCommand,
  ): Promise<ShortlistTenderResult> {
    return this.transactionManager.execute(async (transaction) => {
      const permission = await this.authorizationPolicy.canShortlist(
        {
          organizationId: command.organizationId,
          actorId: command.actorId,
          tenderId: command.tenderId,
        },
        transaction,
      );

      if (!permission.allowed) {
        throw new PermissionDeniedError({
          permission: "tender:shortlist",
        });
      }

      const tender = await this.tenderRepository.findById(
        {
          organizationId: command.organizationId,
          tenderId: command.tenderId,
        },
        transaction,
      );

      if (!tender) {
        throw new TenderNotFoundError({
          tenderId: command.tenderId,
        });
      }

      if (
        command.expectedVersion !== undefined &&
        tender.version !== command.expectedVersion
      ) {
        throw new TenderVersionConflictError({
          tenderId: command.tenderId,
          expectedVersion: command.expectedVersion,
          actualVersion: tender.version,
        });
      }

      const occurredAt = this.clock.now();

      tender.shortlist({
        actorId: ActorId.from(command.actorId),
        reason: command.reason,
        occurredAt,
      });

      await this.tenderRepository.save(
        {
          organizationId: command.organizationId,
          tender,
          expectedVersion: command.expectedVersion,
        },
        transaction,
      );

      await this.auditWriter.write(
        {
          organizationId: command.organizationId,
          actorId: command.actorId,
          action: "tender.shortlist",
          resourceType: "Tender",
          resourceId: command.tenderId,
          occurredAt,
          correlationId: command.correlationId,
        },
        transaction,
      );

      const events = tender.pullDomainEvents();

      await this.outboxWriter.write(
        {
          organizationId: command.organizationId,
          events,
          correlationId: command.correlationId,
        },
        transaction,
      );

      return {
        tenderId: tender.id.value,
        status: tender.status,
        version: tender.version,
        shortlistedAt: occurredAt.toISOString(),
      };
    });
  }
}
```

---

## 24. Règles des use cases

Un use case doit : représenter une seule intention ; rester indépendant du transport ; recevoir une Command ou Query typée ; retourner un résultat typé ; appliquer tenant et permissions ; coordonner les ports ; définir sa transaction ; traduire les erreurs techniques attendues ; être observable depuis ses frontières.

Un use case ne doit pas : recevoir Request ou Response ; utiliser un décorateur NestJS ; retourner une entité Prisma ; sérialiser une réponse HTTP ; contenir du HTML ; publier directement sur un fournisseur externe ; ouvrir plusieurs transactions incohérentes ; masquer un échec.

---

## 25. Use case de Query

Une Query ne doit pas charger un agrégat complet si un read model suffit.

Template :

```typescript
export class GetTenderByIdUseCase {
  constructor(
    private readonly authorizationPolicy: TenderAuthorizationPolicy,
    private readonly tenderQueries: TenderQueries,
  ) {}

  async execute(query: GetTenderByIdQuery): Promise<TenderDetails> {
    const permission = await this.authorizationPolicy.canRead({
      organizationId: query.organizationId,
      actorId: query.actorId,
      tenderId: query.tenderId,
    });

    if (!permission.allowed) {
      throw new PermissionDeniedError({
        permission: "tender:read",
      });
    }

    const tender = await this.tenderQueries.findDetails({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });

    if (!tender) {
      throw new TenderNotFoundError({
        tenderId: query.tenderId,
      });
    }

    return tender;
  }
}
```

---

## 26. Résultats applicatifs

Les résultats sont indépendants du transport.

Exemple :

```typescript
export type ShortlistTenderResult = Readonly<{
  tenderId: string;
  status: "SHORTLISTED";
  version: number;
  shortlistedAt: string;
}>;
```

Un résultat ne doit pas contenir : statut HTTP ; headers ; Response NestJS ; modèle Prisma ; informations non nécessaires ; données sensibles non autorisées.

---

## 27. Policies d'autorisation

Template :

```typescript
export interface TenderAuthorizationPolicy {
  canRead(input: {
    organizationId: string;
    actorId: string;
    tenderId: string;
  }): Promise<AuthorizationDecision>;

  canShortlist(input: {
    organizationId: string;
    actorId: string;
    tenderId: string;
  }): Promise<AuthorizationDecision>;
}

export type AuthorizationDecision =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reasonCode: string;
    };
```

Une policy doit pouvoir intégrer : membership ; rôle ; permission ; Workspace ; confidentialité ; ownership ; état de la ressource si nécessaire.

Les invariants métier restent dans le Domain.

---

## 28. Ports applicatifs

Créer un port pour une dépendance externe ou une capacité partagée significative.

Exemple :

```typescript
export interface TenderSourceImporter {
  import(input: {
    organizationId: string;
    sourceUrl: string;
    correlationId: string;
  }): Promise<ImportedTenderSource>;
}
```

Chaque port doit préciser : les entrées ; la sortie ; les erreurs attendues ; l'idempotence ; le tenant scope ; les timeouts attendus ; les responsabilités exclues.

---

## 29. Repository Pattern officiel

L'interface appartient au module propriétaire.

Template :

```typescript
export interface TenderRepository {
  findById(
    input: {
      organizationId: string;
      tenderId: string;
    },
    transaction?: TransactionContext,
  ): Promise<Tender | null>;

  existsByReference(
    input: {
      organizationId: string;
      reference: string;
    },
    transaction?: TransactionContext,
  ): Promise<boolean>;

  save(
    input: {
      organizationId: string;
      tender: Tender;
      expectedVersion?: number;
    },
    transaction?: TransactionContext,
  ): Promise<void>;
}
```

---

## 30. Règles des repositories

Un repository doit : imposer `organizationId` ; exprimer les besoins du module ; retourner des objets Domain ; utiliser un mapper explicite ; prendre en charge la concurrence ; participer à une transaction ; traduire les erreurs de persistance.

Un repository ne doit pas : être un CRUD générique ; retourner `Prisma.Tender` ; accepter `Record<string, unknown>` ; permettre un update partiel arbitraire ; exposer le client Prisma ; effectuer un appel externe ; publier un événement.

---

## 31. Repository Prisma

Exemple conceptuel :

```typescript
export class PrismaTenderRepository implements TenderRepository {
  constructor(
    private readonly database: DatabaseContext,
    private readonly mapper: TenderPersistenceMapper,
  ) {}

  async findById(
    input: {
      organizationId: string;
      tenderId: string;
    },
    transaction?: TransactionContext,
  ): Promise<Tender | null> {
    const client = this.database.resolveClient(transaction);

    const record = await client.tender.findFirst({
      where: {
        id: input.tenderId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
    });

    return record ? this.mapper.toDomain(record) : null;
  }

  async save(
    input: {
      organizationId: string;
      tender: Tender;
      expectedVersion?: number;
    },
    transaction?: TransactionContext,
  ): Promise<void> {
    const client = this.database.resolveClient(transaction);
    const persistence = this.mapper.toPersistence(input.tender);

    const result = await client.tender.updateMany({
      where: {
        id: persistence.id,
        organizationId: input.organizationId,
        version: input.expectedVersion ?? persistence.version,
      },
      data: {
        title: persistence.title,
        status: persistence.status,
        updatedAt: persistence.updatedAt,
        version: {
          increment: 1,
        },
      },
    });

    if (result.count !== 1) {
      throw new PersistenceConcurrencyError({
        resourceType: "Tender",
        resourceId: persistence.id,
      });
    }
  }
}
```

---

## 32. Mapping de persistance

Template :

```typescript
export class TenderPersistenceMapper {
  toDomain(record: TenderPersistenceRecord): Tender {
    return Tender.rehydrate({
      id: TenderId.from(record.id),
      organizationId: OrganizationId.from(record.organizationId),
      title: TenderTitle.create(record.title),
      reference: TenderReference.create(record.reference),
      status: TenderStatus.from(record.status),
      officialDeadline: record.officialDeadline
        ? OfficialDeadline.fromDate(record.officialDeadline)
        : undefined,
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  toPersistence(tender: Tender): TenderPersistenceData {
    return {
      id: tender.id.value,
      organizationId: tender.organizationId.value,
      title: tender.title.value,
      reference: tender.reference.value,
      status: tender.status.value,
      officialDeadline: tender.officialDeadline?.toDate(),
      version: tender.version,
      createdAt: tender.createdAt,
      updatedAt: tender.updatedAt,
    };
  }
}
```

Le mapper : ne persiste pas ; ne charge pas de relation ; ne produit pas d'événement ; ne remplit pas silencieusement une donnée manquante ; ne contourne pas un invariant.

---

## 33. Read repositories et Queries

Les lectures optimisées utilisent un port distinct si cela améliore la clarté.

```typescript
export interface TenderQueries {
  findDetails(input: {
    organizationId: string;
    tenderId: string;
  }): Promise<TenderDetails | null>;

  list(input: {
    organizationId: string;
    filters: TenderListFilters;
    pagination: CursorPagination;
  }): Promise<PaginatedResult<TenderListItem>>;
}
```

Les read models peuvent être construits directement depuis Prisma dans l'Infrastructure.

Ils ne sont pas obligés de passer par l'agrégat.

---

## 34. Transaction Manager

Template :

```typescript
export interface TransactionManager {
  execute<T>(
    operation: (transaction: TransactionContext) => Promise<T>,
  ): Promise<T>;
}

export type TransactionContext = {
  readonly transactionId: string;
};
```

L'implémentation Prisma conserve le client transactionnel hors du contrat public.

Le `TransactionContext` peut référencer un registre technique interne.

Le use case ne doit pas connaître `Prisma.TransactionClient`.

---

## 35. Idempotence

Pour une opération rejouable :

```typescript
export type CreateManualTenderCommand = Readonly<{
  organizationId: string;
  actorId: string;
  idempotencyKey: string;
  title: string;
  reference: string;
}>;
```

Flux :

```text
Check idempotency record
→ Return previous result when completed
→ Reserve key
→ Execute use case
→ Persist result atomically
→ Return result
```

La clé doit être liée à : l'organisation ; l'opération ; éventuellement l'acteur ; une empreinte de la requête.

Une même clé avec un payload différent doit produire un conflit.

---

## 36. Optimistic locking

Les agrégats soumis à des modifications concurrentes doivent disposer d'une version.

Exemple :

```text
version: integer
```

L'API peut transmettre :

```text
If-Match: "7"
```

ou un champ contractuel explicite.

En cas de conflit :

```text
CONCURRENT_MODIFICATION
HTTP 409
```

Aucun écrasement silencieux ne doit être accepté pour une décision critique.

---

## 37. Audit et Outbox

L'audit et l'Outbox doivent être écrits dans la même transaction que la modification métier lorsque la cohérence l'exige.

```text
Persist aggregate
+
Persist audit
+
Persist Outbox
+
Commit
```

L'email, le webhook ou l'appel IA sont exécutés après commit.

---

## 38. Structure Infrastructure

```text
infrastructure/
├── persistence/
│   ├── prisma/
│   │   └── tender.prisma-types.ts
│   ├── mappers/
│   │   └── tender.persistence-mapper.ts
│   └── repositories/
│       ├── prisma-tender.repository.ts
│       └── prisma-tender.queries.ts
├── messaging/
│   └── tender-event.mapper.ts
├── external/
│   └── procurement-source.adapter.ts
└── configuration/
    └── tender.config.ts
```

Les types d'un fournisseur doivent rester dans l'Infrastructure.

---

## 39. Structure Interfaces

```text
interfaces/
├── http/
│   ├── controllers/
│   ├── schemas/
│   ├── presenters/
│   └── mappers/
├── workers/
├── consumers/
├── webhooks/
└── cli/
```

Les Interfaces traduisent un protocole externe vers l'Application.

Elles ne portent pas les règles métier.

---

## 40. Schémas HTTP

Utiliser un schéma explicite à la frontière.

Exemple Zod :

```typescript
export const ShortlistTenderBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(2_000).optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
  })
  .strict();

export type ShortlistTenderBody = z.infer<
  typeof ShortlistTenderBodySchema
>;
```

Valider séparément : path params ; query params ; body ; headers applicatifs.

---

## 41. Controller officiel

Template :

```typescript
@Controller("/api/v1/tenders")
export class TenderCommandController {
  constructor(
    private readonly shortlistTender: ShortlistTenderUseCase,
  ) {}

  @Post(":tenderId/shortlist")
  async shortlist(
    @AuthenticatedActor() actor: HttpActorContext,
    @Param("tenderId", UuidPipe) tenderId: string,
    @Body(ShortlistTenderBodyPipe) body: ShortlistTenderBody,
    @RequestContext() requestContext: HttpRequestContext,
  ): Promise<ShortlistTenderResponse> {
    const result = await this.shortlistTender.execute({
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      tenderId,
      reason: body.reason,
      expectedVersion: body.expectedVersion,
      requestId: requestContext.requestId,
      correlationId: requestContext.correlationId,
    });

    return ShortlistTenderPresenter.present(result);
  }
}
```

---

## 42. Règles des controllers

Un controller doit : authentifier ; extraire le contexte ; valider le protocole ; construire la Command ou Query ; appeler un use case ; présenter le résultat.

Il ne doit pas : utiliser Prisma ; ouvrir de transaction ; vérifier un invariant métier ; modifier un statut ; envoyer un email ; produire un événement métier ; appeler directement un autre controller ; retourner une entité Domain ; exposer un modèle de persistance.

---

## 43. Presenters

Template :

```typescript
export class ShortlistTenderPresenter {
  static present(
    result: ShortlistTenderResult,
  ): ShortlistTenderResponse {
    return {
      id: result.tenderId,
      status: result.status,
      version: result.version,
      shortlistedAt: result.shortlistedAt,
    };
  }
}
```

Conformément à `API_PATTERNS.md` §9, une ressource unique est retournée sans enveloppe générique : le Presenter renvoie l'objet directement, jamais `{ data: {...} }`.

Un Presenter doit : contrôler les champs exposés ; appliquer le format API ; sérialiser dates et montants ; rester déterministe ; ne pas charger de données ; ne pas appliquer de permission ; ne pas modifier le Domain.

---

## 44. Contrats HTTP

Exemple :

```typescript
export type ShortlistTenderResponse = {
  id: string;
  status: "SHORTLISTED";
  version: number;
  shortlistedAt: string;
};
```

Les contrats publics doivent rester indépendants : de Prisma ; du Domain interne ; de NestJS ; du fournisseur de validation.

---

## 45. Mapping des erreurs vers HTTP

Table recommandée :

| Catégorie | Exemple | HTTP |
|---|---|---:|
| Validation | `VALIDATION_FAILED` | 422 |
| Authentication | `AUTHENTICATION_REQUIRED` | 401 |
| Authorization | `PERMISSION_MISSING` | 403 |
| Not Found | `TENDER_NOT_FOUND` | 404 |
| Business Conflict | `INVALID_TENDER_STATUS_TRANSITION` | 409 |
| Concurrency | `CONCURRENT_MODIFICATION` | 409 |
| Rate Limit | `RATE_LIMIT_EXCEEDED` | 429 |
| Dependency | `DEPENDENCY_UNAVAILABLE` | 503 |
| Internal | `INTERNAL_ERROR` | 500 |

Ces codes sont ceux du catalogue canonique défini par `API_PATTERNS.md` §14 ; aucun code local ne doit en diverger.

Le mapping doit être centralisé.

Le Domain ne doit pas connaître ces statuts.

---

## 46. Enveloppe d'erreur

```json
{
  "error": {
    "code": "INVALID_TENDER_STATUS_TRANSITION",
    "message": "The tender cannot be shortlisted from its current state.",
    "details": {
      "currentStatus": "ARCHIVED"
    },
    "requestId": "req_01..."
  }
}
```

Les détails doivent être : sûrs ; minimaux ; stables ; utiles au client.

---

## 47. Consumers

Template :

```typescript
export class DocumentVersionConfirmedConsumer {
  constructor(
    private readonly enqueueProcessing:
      EnqueueDocumentProcessingUseCase,
  ) {}

  async handle(
    message: DocumentVersionConfirmedContract,
  ): Promise<void> {
    const validated =
      DocumentVersionConfirmedSchema.parse(message);

    await this.enqueueProcessing.execute({
      organizationId: validated.organizationId,
      documentId: validated.documentId,
      documentVersionId: validated.documentVersionId,
      idempotencyKey: validated.eventId,
      correlationId: validated.correlationId,
    });
  }
}
```

Un consumer doit : valider le message ; supporter la version attendue ; être idempotent ; appeler un use case ; classer les erreurs ; respecter le tenant ; produire de l'observabilité.

---

## 48. Workers

Template :

```typescript
export class ProcessDocumentWorker {
  constructor(
    private readonly processDocument:
      ProcessDocumentVersionUseCase,
  ) {}

  async execute(job: ProcessDocumentJob): Promise<void> {
    const validated = ProcessDocumentJobSchema.parse(job);

    await this.processDocument.execute({
      organizationId: validated.organizationId,
      documentVersionId: validated.documentVersionId,
      processingRunId: validated.processingRunId,
      idempotencyKey: validated.jobId,
      correlationId: validated.correlationId,
    });
  }
}
```

Le worker ne doit pas contenir le workflow métier complet.

---

## 49. Contrats d'événements

Les événements publics ou partagés disposent d'un contrat distinct du Domain interne.

```typescript
export const TenderShortlistedEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.literal("TenderShortlisted"),
  eventVersion: z.literal(1),
  organizationId: z.string().uuid(),
  aggregateId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  correlationId: z.string(),
  payload: z.object({
    tenderId: z.string().uuid(),
    actorId: z.string().uuid(),
    reason: z.string().optional(),
  }),
});

export type TenderShortlistedEventContract =
  z.infer<typeof TenderShortlistedEventSchema>;
```

Le mapping Domain Event vers Integration Event appartient à l'Infrastructure ou à une couche de contrats dédiée.

---

## 50. Module NestJS

Template :

```typescript
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    OutboxModule,
    SecurityModule,
  ],
  controllers: [
    TenderCommandController,
    TenderQueryController,
  ],
  providers: [
    CreateManualTenderUseCase,
    ShortlistTenderUseCase,
    GetTenderByIdUseCase,
    TenderPersistenceMapper,
    {
      provide: TENDER_REPOSITORY,
      useClass: PrismaTenderRepository,
    },
    {
      provide: TENDER_QUERIES,
      useClass: PrismaTenderQueries,
    },
    {
      provide: TENDER_AUTHORIZATION_POLICY,
      useClass: DefaultTenderAuthorizationPolicy,
    },
  ],
  exports: [
    CreateManualTenderUseCase,
    ShortlistTenderUseCase,
    GetTenderByIdUseCase,
  ],
})
export class TenderModule {}
```

---

## 51. Règles d'assemblage NestJS

Le module NestJS doit : assembler les dépendances ; exposer uniquement les capacités publiques ; importer explicitement ses dépendances ; éviter les providers globaux ; utiliser des tokens stables ; garder les adapters remplaçables.

Il ne doit pas : contenir de Business Rule ; devenir un service locator ; exporter tous ses providers ; créer des dépendances circulaires ; importer le module racine complet.

---

## 52. Tokens d'injection

Template :

```typescript
export const TENDER_REPOSITORY =
  Symbol("TENDER_REPOSITORY");

export const TENDER_QUERIES =
  Symbol("TENDER_QUERIES");

export const TENDER_AUTHORIZATION_POLICY =
  Symbol("TENDER_AUTHORIZATION_POLICY");
```

Les tokens : appartiennent au module ; utilisent un nom unique ; sont exposés uniquement si nécessaire ; ne doivent pas être des chaînes dispersées.

---

## 53. Tests du Domain

Exemple :

```typescript
describe("Tender.shortlist", () => {
  it("shortlists a new tender and records an event", () => {
    const tender = TenderFactory.newTender({
      status: TenderStatus.Discovered,
    });

    tender.shortlist({
      actorId: ActorId.from(ACTOR_ID),
      occurredAt: FIXED_NOW,
    });

    expect(tender.status).toBe(TenderStatus.Shortlisted);
    expect(tender.pullDomainEvents()).toEqual([
      expect.objectContaining({
        eventType: "TenderShortlisted",
        aggregateId: tender.id.value,
      }),
    ]);
  });

  it("rejects shortlisting an archived tender", () => {
    const tender = TenderFactory.archivedTender();

    expect(() =>
      tender.shortlist({
        actorId: ActorId.from(ACTOR_ID),
        occurredAt: FIXED_NOW,
      }),
    ).toThrow(TenderInvalidStateError);
  });
});
```

Tests minimaux d'un comportement Domain : cas nominal ; chaque état invalide ; invariant ; événement ; absence de mutation après échec ; précision des montants ou dates si applicable.

---

## 54. Tests de use case

Exemple :

```typescript
describe("ShortlistTenderUseCase", () => {
  it("shortlists a tenant-owned tender", async () => {
    const repository = new InMemoryTenderRepository();
    const tender = TenderFactory.newTender({
      organizationId: ORGANIZATION_A_ID,
    });

    await repository.seed(tender);

    const useCase = createUseCase({
      repository,
      authorization: allow(),
      clock: fixedClock(FIXED_NOW),
    });

    const result = await useCase.execute({
      organizationId: ORGANIZATION_A_ID,
      actorId: ACTOR_ID,
      tenderId: tender.id.value,
      requestId: REQUEST_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.status).toBe("SHORTLISTED");
    expect(repository.savedIds).toContain(tender.id.value);
  });

  it("refuses an unauthorized actor", async () => {
    const useCase = createUseCase({
      authorization: deny("permission_missing"),
    });

    await expect(
      useCase.execute(validCommand()),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("does not load a tender from another tenant", async () => {
    const repository = new InMemoryTenderRepository();

    await repository.seed(
      TenderFactory.newTender({
        organizationId: ORGANIZATION_B_ID,
      }),
    );

    const useCase = createUseCase({
      repository,
      authorization: allow(),
    });

    await expect(
      useCase.execute({
        ...validCommand(),
        organizationId: ORGANIZATION_A_ID,
      }),
    ).rejects.toThrow(TenderNotFoundError);
  });
});
```

---

## 55. Tests de repository

Les tests d'intégration doivent vérifier : mapping vers le Domain ; mapping depuis le Domain ; filtrage tenant ; soft deletion ; contraintes uniques ; optimistic locking ; transaction ; rollback ; pagination ; tri stable.

Exemple :

```typescript
describe("PrismaTenderRepository", () => {
  it("does not return a tender from another organization", async () => {
    await seedTender({
      organizationId: ORGANIZATION_B_ID,
      tenderId: TENDER_ID,
    });

    const result = await repository.findById({
      organizationId: ORGANIZATION_A_ID,
      tenderId: TENDER_ID,
    });

    expect(result).toBeNull();
  });
});
```

---

## 56. Tests API

Les tests de contrat ou E2E doivent couvrir : authentification ; validation ; permission ; tenant ; cas nominal ; not found ; conflit métier ; concurrence ; sérialisation ; absence de données sensibles.

Exemple de matrice :

| Cas | Résultat |
|---|---|
| Utilisateur autorisé | 200 |
| Sans authentification | 401 |
| Sans permission | 403 |
| Ressource autre tenant | 404 ou 403 selon politique |
| État incompatible | 409 |
| Version obsolète | 409 |
| Body invalide | 400 |

---

## 57. Tests d'architecture

Chaque module doit être protégé par des règles automatiques.

Exemples :

```text
domain/** must not import @nestjs/*
domain/** must not import @prisma/*
application/** must not import interfaces/**
application/** must not import infrastructure/**
contracts/** must not import Prisma types
modules/A/** must not deep-import modules/B/**
```

Les exceptions doivent être documentées.

---

## 58. Test factories

Les factories doivent créer des objets valides par défaut.

Exemple :

```typescript
export class TenderFactory {
  static newTender(
    overrides: Partial<TenderFactoryInput> = {},
  ): Tender {
    return Tender.rehydrate({
      id: TenderId.from(overrides.id ?? TENDER_ID),
      organizationId: OrganizationId.from(
        overrides.organizationId ?? ORGANIZATION_A_ID,
      ),
      title: TenderTitle.create(
        overrides.title ?? "Construction d'un centre administratif",
      ),
      reference: TenderReference.create(
        overrides.reference ?? "AO-2026-001",
      ),
      status: overrides.status ?? TenderStatus.Discovered,
      version: overrides.version ?? 1,
      createdAt: overrides.createdAt ?? FIXED_NOW,
      updatedAt: overrides.updatedAt ?? FIXED_NOW,
    });
  }
}
```

Les factories ne doivent pas masquer les propriétés importantes pour le test.

---

## 59. Fakes et In-Memory Adapters

Un fake doit respecter le contrat du port.

Exemple :

```typescript
export class InMemoryTenderRepository
  implements TenderRepository
{
  private readonly records = new Map<string, Tender>();

  async findById(input: {
    organizationId: string;
    tenderId: string;
  }): Promise<Tender | null> {
    const tender = this.records.get(input.tenderId);

    if (
      !tender ||
      tender.organizationId.value !== input.organizationId
    ) {
      return null;
    }

    return tender;
  }

  async save(input: {
    organizationId: string;
    tender: Tender;
  }): Promise<void> {
    if (
      input.tender.organizationId.value !==
      input.organizationId
    ) {
      throw new TenantScopeViolationError();
    }

    this.records.set(
      input.tender.id.value,
      input.tender,
    );
  }
}
```

Un fake ne doit pas être si permissif qu'il masque les règles de production.

---

## 60. Documentation locale

Chaque module doit maintenir `README.md`.

Il doit documenter : responsabilité ; concepts principaux ; données propriétaires ; API publique ; permissions ; tenant scope ; événements ; dépendances ; workflows asynchrones ; limites ; commandes de test ; ADR applicables.

---

## 61. Template du README

```markdown
# Tenders Module

## Responsibility

## Domain concepts

## Aggregate boundaries

## Owned data

## Public use cases

## Public queries

## Public events

## Permissions

## Tenant isolation

## Transactions

## Asynchronous workflows

## External dependencies

## AI usage

## Error codes

## Observability

## Testing

## Migrations

## Known limitations

## Related documentation
```

---

## 62. Création d'un nouveau module

Ordre recommandé :

```text
1. Confirm module responsibility
2. Identify data ownership
3. Identify tenant scope
4. Identify permissions
5. Identify aggregate boundaries
6. List public use cases
7. List public queries
8. List public events
9. Define public contracts
10. Define ports
11. Design persistence
12. Define transactions
13. Define async workflows
14. Define observability
15. Define tests
16. Implement one vertical slice
17. Review boundaries
18. Document
```

---

## 63. Premier vertical slice recommandé

Le premier slice doit être suffisamment petit pour valider l'ensemble du chemin.

Exemple : `Create Manual Tender`

Il doit inclure :

```text
HTTP Schema
→ Controller
→ Command
→ Use Case
→ Permission
→ Aggregate
→ Repository
→ Database
→ Audit
→ Outbox
→ Presenter
→ Tests
```

Il ne doit pas chercher à implémenter tout le module simultanément.

---

## 64. Exemple complet : création manuelle d'un Tender

### 64.1 Route

```text
POST /api/v1/tenders
```

### 64.2 Requête

```json
{
  "title": "Construction d'un centre administratif",
  "reference": "AO-2026-001",
  "officialDeadline": "2026-10-15T15:00:00+02:00"
}
```

### 64.3 Réponse

```json
{
  "id": "7fbad99b-dcd7-4e92-96ca-4594984c1653",
  "title": "Construction d'un centre administratif",
  "reference": "AO-2026-001",
  "status": "DISCOVERED",
  "version": 1,
  "createdAt": "2026-07-25T14:00:00Z"
}
```

Conformément à `API_PATTERNS.md` §9, aucune enveloppe `data` n'entoure la ressource. Le statut initial d'un Tender est `DISCOVERED` (`bible/03-domain/business-rules.md` §7), et sa `version` initiale est `1` (`docs/04-architecture/DATABASE_DESIGN.md` §8.3).

---

## 65. Schéma d'entrée

```typescript
export const CreateManualTenderBodySchema = z
  .object({
    title: z.string().trim().min(3).max(500),
    reference: z.string().trim().min(3).max(100),
    officialDeadline: z.string().datetime({
      offset: true,
    }).optional(),
  })
  .strict();

export type CreateManualTenderBody =
  z.infer<typeof CreateManualTenderBodySchema>;
```

---

## 66. Command de création

```typescript
export type CreateManualTenderCommand = Readonly<{
  organizationId: string;
  actorId: string;
  title: string;
  reference: string;
  officialDeadline?: string;
  idempotencyKey: string;
  requestId: string;
  correlationId: string;
}>;
```

---

## 67. Agrégat de création

```typescript
const tender = Tender.create({
  id: TenderId.from(this.idGenerator.generate()),
  organizationId: OrganizationId.from(
    command.organizationId,
  ),
  title: TenderTitle.create(command.title),
  reference: TenderReference.create(
    command.reference,
  ),
  officialDeadline: command.officialDeadline
    ? OfficialDeadline.fromIsoString(
        command.officialDeadline,
      )
    : undefined,
  actorId: ActorId.from(command.actorId),
  occurredAt: this.clock.now(),
});
```

---

## 68. Use case de création

```typescript
export class CreateManualTenderUseCase {
  constructor(
    private readonly transactionManager: TransactionManager,
    private readonly tenderRepository: TenderRepository,
    private readonly authorizationPolicy:
      TenderAuthorizationPolicy,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly auditWriter: AuditWriter,
    private readonly outboxWriter: OutboxWriter,
    private readonly idempotencyStore: IdempotencyStore,
  ) {}

  async execute(
    command: CreateManualTenderCommand,
  ): Promise<CreateManualTenderResult> {
    const previous =
      await this.idempotencyStore.findCompleted({
        organizationId: command.organizationId,
        operation: "tender.create-manual",
        key: command.idempotencyKey,
      });

    if (previous) {
      return CreateManualTenderResultSchema.parse(
        previous.result,
      );
    }

    return this.transactionManager.execute(
      async (transaction) => {
        const permission =
          await this.authorizationPolicy.canCreate({
            organizationId: command.organizationId,
            actorId: command.actorId,
          });

        if (!permission.allowed) {
          throw new PermissionDeniedError({
            permission: "tender:create",
          });
        }

        const reference =
          TenderReference.create(command.reference);

        const referenceExists =
          await this.tenderRepository.existsByReference(
            {
              organizationId: command.organizationId,
              reference: reference.value,
            },
            transaction,
          );

        if (referenceExists) {
          throw new TenderReferenceAlreadyExistsError({
            reference: reference.value,
          });
        }

        const occurredAt = this.clock.now();

        const tender = Tender.create({
          id: TenderId.from(
            this.idGenerator.generate(),
          ),
          organizationId: OrganizationId.from(
            command.organizationId,
          ),
          title: TenderTitle.create(command.title),
          reference,
          officialDeadline: command.officialDeadline
            ? OfficialDeadline.fromIsoString(
                command.officialDeadline,
              )
            : undefined,
          actorId: ActorId.from(command.actorId),
          occurredAt,
        });

        await this.tenderRepository.save(
          {
            organizationId: command.organizationId,
            tender,
          },
          transaction,
        );

        await this.auditWriter.write(
          {
            organizationId: command.organizationId,
            actorId: command.actorId,
            action: "tender.create",
            resourceType: "Tender",
            resourceId: tender.id.value,
            occurredAt,
            correlationId: command.correlationId,
          },
          transaction,
        );

        await this.outboxWriter.write(
          {
            organizationId: command.organizationId,
            events: tender.pullDomainEvents(),
            correlationId: command.correlationId,
          },
          transaction,
        );

        const result: CreateManualTenderResult = {
          tenderId: tender.id.value,
          title: tender.title.value,
          reference: tender.reference.value,
          status: tender.status.value,
          version: tender.version,
          createdAt: tender.createdAt.toISOString(),
        };

        await this.idempotencyStore.complete(
          {
            organizationId: command.organizationId,
            operation: "tender.create-manual",
            key: command.idempotencyKey,
            result,
          },
          transaction,
        );

        return result;
      },
    );
  }
}
```

---

<!--
SECTION 69 INCOMPLETE — le message source a été tronqué par la limite de caractères
en plein milieu du controller de création ("Controller de création"), juste après
le paramètre @RequestContext(). Le reste de la section 69 (fin du controller,
et toute section suivante : contrat de réponse, checklist finale, critères
d'acceptation, etc.) n'a pas été reçu et n'a donc pas été reconstitué ici.
-->

## 69. Controller de création

```typescript
@Controller("/api/v1/tenders")
export class TenderCommandController {
  constructor(
    private readonly createManualTender:
      CreateManualTenderUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  async create(
    @AuthenticatedActor() actor: HttpActorContext,
    @Body(CreateManualTenderBodyPipe)
    body: CreateManualTenderBody,
    @Headers("idempotency-key")
    idempotencyKey: string,
    @RequestContext()
    requestContext: HttpRequestContext,
  ): Promise<CreateManualTenderResponse> {
    // TODO: section tronquée dans la source — corps de la méthode manquant.
  }
}
```
