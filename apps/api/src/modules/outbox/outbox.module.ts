import { type DynamicModule, Module, type ModuleMetadata, type Provider, type Type } from "@nestjs/common";
import { DatabaseModule } from "../../shared-kernel/database.module";
import { SharedKernelModule } from "../../shared-kernel/shared-kernel.module";
import { OUTBOX_EVENT_DISPATCHER } from "./application/ports/outbox-event-dispatcher";
import { OUTBOX_EVENT_HANDLERS, type OutboxEventHandler } from "./application/ports/outbox-event-handler";
import { OUTBOX_EVENT_REPOSITORY } from "./application/ports/outbox-event.repository";
import { PROCESSED_EVENT_REPOSITORY } from "./application/ports/processed-event.repository";
import { PublishPendingOutboxEventsUseCase } from "./application/use-cases/publish-pending-outbox-events.use-case";
import { RecordEventProcessedByConsumerUseCase } from "./application/use-cases/record-event-processed-by-consumer.use-case";
import { CompositeOutboxEventDispatcher } from "./infrastructure/composite-outbox-event-dispatcher";
import { OutboxPublisherWorker } from "./infrastructure/outbox-publisher.worker";
import { PrismaOutboxEventRepository } from "./infrastructure/prisma-outbox-event.repository";
import { PrismaProcessedEventRepository } from "./infrastructure/prisma-processed-event.repository";

// Mission §38/§134 (correctif) — plus de `OUTBOX_WRITER`/`PrismaOutboxWriter` ici : voir
// `outbox-writer.module.ts` pour pourquoi ce module ne doit plus jamais être importé statiquement
// ailleurs que par `app.module.ts` (`.forRoot()`, une seule fois).
const BASE_PROVIDERS: Provider[] = [
  PrismaOutboxEventRepository,
  PrismaProcessedEventRepository,
  { provide: OUTBOX_EVENT_REPOSITORY, useExisting: PrismaOutboxEventRepository },
  { provide: PROCESSED_EVENT_REPOSITORY, useExisting: PrismaProcessedEventRepository },
  { provide: OUTBOX_EVENT_DISPATCHER, useClass: CompositeOutboxEventDispatcher },
  PublishPendingOutboxEventsUseCase,
  RecordEventProcessedByConsumerUseCase,
  OutboxPublisherWorker,
];

/**
 * Module de plateforme (skills/platform-foundation/ARCHITECTURE_RULES.md §19.1/§36) — assemble le
 * VRAI worker de publication (`OutboxPublisherWorker`) + le dispatcher + le registre de handlers.
 * `OUTBOX_WRITER` (utilisé par tout module producteur d'événements) vit désormais dans
 * `OutboxWriterModule`, jamais ici — voir ce fichier pour le pourquoi (bug réel trouvé §135
 * scénario A : deux instances de ce module, deux pollers, une course sur les mêmes lignes
 * `OutboxEvent`).
 *
 * Correctif audit Codex P1-001 (Sprint 1) — `OutboxPublisherWorker` démarre/arrête le poller réel.
 * Correctif Sprint 16 (audit honnête, mission §38/§134) — le commentaire précédent affirmait
 * qu'un "futur module consommateur ajouterait son propre provider sur OUTBOX_EVENT_HANDLERS dans
 * SON PROPRE module" : c'est ARCHITECTURALEMENT IMPOSSIBLE en NestJS standard (un provider d'un
 * module ne peut jamais être réécrit depuis un module qui l'importe simplement — `CompositeOutboxEventDispatcher`
 * résout toujours `OUTBOX_EVENT_HANDLERS` depuis LE PROPRE registre de `OutboxModule`, jamais celui
 * d'un importeur). Confirmé empiriquement : `OUTBOX_EVENT_HANDLERS` valait `[]` depuis Sprint 1,
 * AUCUN événement n'a jamais été livré à un handler, chaque OutboxEvent a toujours fini en
 * DEAD_LETTER. `OutboxModule.forRoot(...)` (appelé UNE SEULE FOIS, dans `app.module.ts`) est le
 * point d'assemblage correct.
 *
 * Correctif n°2, trouvé en exécutant réellement le scénario §135 A (pas seulement en compilant) :
 * l'hypothèse "NestJS résout la même instance de module par déduplication de classe" était FAUSSE.
 * Un import statique `imports: [OutboxModule]` ailleurs (Tenders/Workspace/Opportunity/...)
 * instancie un DEUXIÈME nœud de module (providers de la décoration `@Module` ci-dessous, PAS ceux
 * de `forRoot()`), avec son propre `OutboxPublisherWorker` qui se met à réclamer les mêmes lignes
 * `OutboxEvent` en base — sans handler enregistré côté lui, donc en échec immédiat, potentiellement
 * AVANT que la bonne instance (celle de `forRoot()`) n'ait pu traiter l'événement. C'est pourquoi ce
 * module n'a plus vocation à être importé statiquement du tout : voir `OutboxWriterModule`.
 */
@Module({
  imports: [SharedKernelModule, DatabaseModule],
  providers: [...BASE_PROVIDERS, { provide: OUTBOX_EVENT_HANDLERS, useValue: [] }],
  exports: [PublishPendingOutboxEventsUseCase, RecordEventProcessedByConsumerUseCase],
})
export class OutboxModule {
  /** Appelé UNE SEULE FOIS, dans `app.module.ts` (mission Sprint 16 — ferme la boucle
   *  event -> Outbox -> handler réel). `handlerImports` : les modules qui fournissent les
   *  dépendances des classes listées dans `handlers` (ex. `IntegrationEventConsumersModule` pour
   *  `CreateWebhookDeliveriesForEventService`). */
  static forRoot(input: { handlerImports: NonNullable<ModuleMetadata["imports"]>; handlers: Type<OutboxEventHandler>[] }): DynamicModule {
    return {
      module: OutboxModule,
      imports: [SharedKernelModule, DatabaseModule, ...input.handlerImports],
      providers: [
        ...BASE_PROVIDERS,
        ...input.handlers,
        {
          provide: OUTBOX_EVENT_HANDLERS,
          useFactory: (...handlers: OutboxEventHandler[]) => handlers,
          inject: input.handlers,
        },
      ],
      exports: [PublishPendingOutboxEventsUseCase, RecordEventProcessedByConsumerUseCase],
    };
  }
}
