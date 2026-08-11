import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../shared-kernel/database.module";
import { SharedKernelModule } from "../../shared-kernel/shared-kernel.module";
import { OUTBOX_EVENT_REPOSITORY } from "./application/ports/outbox-event.repository";
import { OUTBOX_WRITER } from "./application/ports/outbox-writer";
import { PrismaOutboxEventRepository } from "./infrastructure/prisma-outbox-event.repository";
import { PrismaOutboxWriter } from "./infrastructure/prisma-outbox-writer";

/**
 * Mission §38/§134 (correctif Sprint 16, trouvé lors de la première exécution bout-en-bout du
 * scénario §135 A) — module minimal réservé à l'écriture (`OUTBOX_WRITER`), à importer par tout
 * module producteur d'événements. Ne contient JAMAIS le worker/dispatcher/le registre de handlers.
 *
 * Pourquoi ce module existe : l'hypothèse initiale ("NestJS résout la même instance de module par
 * déduplication de classe, qu'il soit importé statiquement `imports: [OutboxModule]` ou via
 * `OutboxModule.forRoot()`") était FAUSSE — Nest instancie deux nœuds de module distincts (un par
 * "forme" d'import). Concrètement, `OutboxModule.forRoot()` (appelé une fois dans `app.module.ts`,
 * avec les vrais handlers) coexistait avec une seconde instance de `OutboxModule`, statique, créée
 * par chaque `imports: [OutboxModule]` ailleurs dans l'app (Tenders/Workspace/Opportunity/...),
 * dont le registre `OUTBOX_EVENT_HANDLERS` valait toujours `[]`. Les DEUX instances démarraient
 * chacune leur propre `OutboxPublisherWorker` (`OnModuleInit`), et se disputaient réellement les
 * mêmes lignes `OutboxEvent` en base (`FOR UPDATE SKIP LOCKED` porte sur la table, pas sur
 * l'instance en mémoire) — un événement pouvait donc être réclamé par l'instance SANS handler et
 * échouer immédiatement ("No outbox handler is registered..."), avant que la bonne instance n'ait
 * eu l'occasion de le traiter. C'est exactement ce qui aurait rendu §135 scénario A silencieusement
 * flaky en production (webhook "configuré" mais jamais livré, ou livré seulement après le premier
 * backoff de ~30s).
 *
 * Le correctif : plus AUCUN autre module n'importe `OutboxModule` statiquement — seul
 * `app.module.ts` l'importe, via `.forRoot()`, une seule fois. Tout le reste importe CE module
 * (`OutboxWriterModule`) pour `OUTBOX_WRITER` uniquement.
 */
@Module({
  imports: [SharedKernelModule, DatabaseModule],
  providers: [PrismaOutboxEventRepository, { provide: OUTBOX_EVENT_REPOSITORY, useExisting: PrismaOutboxEventRepository }, { provide: OUTBOX_WRITER, useClass: PrismaOutboxWriter }],
  exports: [OUTBOX_WRITER],
})
export class OutboxWriterModule {}
