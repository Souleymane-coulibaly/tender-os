import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../shared-kernel/database.module";
import { SharedKernelModule } from "../../shared-kernel/shared-kernel.module";
import { OUTBOX_EVENT_DISPATCHER } from "./application/ports/outbox-event-dispatcher";
import { OUTBOX_EVENT_HANDLERS } from "./application/ports/outbox-event-handler";
import { OUTBOX_EVENT_REPOSITORY } from "./application/ports/outbox-event.repository";
import { OUTBOX_WRITER } from "./application/ports/outbox-writer";
import { PROCESSED_EVENT_REPOSITORY } from "./application/ports/processed-event.repository";
import { PublishPendingOutboxEventsUseCase } from "./application/use-cases/publish-pending-outbox-events.use-case";
import { RecordEventProcessedByConsumerUseCase } from "./application/use-cases/record-event-processed-by-consumer.use-case";
import { CompositeOutboxEventDispatcher } from "./infrastructure/composite-outbox-event-dispatcher";
import { OutboxPublisherWorker } from "./infrastructure/outbox-publisher.worker";
import { PrismaOutboxEventRepository } from "./infrastructure/prisma-outbox-event.repository";
import { PrismaOutboxWriter } from "./infrastructure/prisma-outbox-writer";
import { PrismaProcessedEventRepository } from "./infrastructure/prisma-processed-event.repository";

/**
 * Module de plateforme classique (skills/platform-foundation/ARCHITECTURE_RULES.md §19.1/§36) —
 * pas de Shared Kernel, pas de `@Global()`. Chaque module producteur d'événements importera
 * explicitement `OutboxModule`, exactement comme documenté pour `AuditModule`/`OutboxModule`
 * dans le template de référence (MODULE_TEMPLATE.md §50).
 *
 * Correctif audit Codex P1-001 — `OutboxPublisherWorker` démarre/arrête le poller réel
 * (`OnModuleInit`/`OnModuleDestroy`). Aucun handler enregistré ici en Sprint 1
 * (`OUTBOX_EVENT_HANDLERS` vide par défaut) : un futur module consommateur ajoutera son propre
 * provider sur ce token dans SON PROPRE module, jamais en modifiant celui-ci.
 */
@Module({
  imports: [SharedKernelModule, DatabaseModule],
  providers: [
    PrismaOutboxEventRepository,
    PrismaProcessedEventRepository,
    { provide: OUTBOX_EVENT_REPOSITORY, useExisting: PrismaOutboxEventRepository },
    { provide: PROCESSED_EVENT_REPOSITORY, useExisting: PrismaProcessedEventRepository },
    { provide: OUTBOX_WRITER, useClass: PrismaOutboxWriter },
    { provide: OUTBOX_EVENT_HANDLERS, useValue: [] },
    { provide: OUTBOX_EVENT_DISPATCHER, useClass: CompositeOutboxEventDispatcher },
    PublishPendingOutboxEventsUseCase,
    RecordEventProcessedByConsumerUseCase,
    OutboxPublisherWorker,
  ],
  exports: [OUTBOX_WRITER, PublishPendingOutboxEventsUseCase, RecordEventProcessedByConsumerUseCase],
})
export class OutboxModule {}
