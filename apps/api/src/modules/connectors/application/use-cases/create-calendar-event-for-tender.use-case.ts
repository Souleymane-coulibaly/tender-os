import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { GetTenderUseCase } from "../../../tenders";
import { assertHasConnectorPermission, ConnectorPermission } from "../../domain/connector-permission";
import { CalendarSyncedEvent } from "../../domain/calendar-synced-event.entity";
import { ExternalConnectionClientNotAllowedError, ExternalConnectionNotFoundError, TenderDeadlineNotSetError } from "../../domain/errors";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CALENDAR_SYNCED_EVENT_REPOSITORY, type CalendarSyncedEventRepository } from "../ports/calendar-synced-event.repository";
import { CONNECTOR_PROVIDER_ADAPTERS, type ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";
import { EnsureFreshAccessTokenService } from "../services/ensure-fresh-access-token.service";
import { getAdapter } from "../services/get-adapter";

export type CreateCalendarEventForTenderCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; connectionId: string; tenderId: string }>;
export type CreateCalendarEventForTenderResult = Readonly<{ externalEventId: string; alreadyExisted: boolean }>;

const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;
const DEFAULT_TIMEZONE = "Europe/Paris";

/**
 * Mission §24/§25/§34 — échéance Tender (`submissionDeadline`) -> événement calendrier, action
 * utilisateur explicite (jamais automatique/en masse, mission §24). Idempotent : un
 * `CalendarSyncedEvent` déjà actif pour (connexion, Tender) renvoie l'événement existant SANS
 * appeler le provider une seconde fois (mission §34 "deux clics ne créent jamais deux événements
 * distincts"). Le niveau granularité `TenderMilestone` (échéances secondaires) est explicitement
 * différé — seule l'échéance principale du Tender (`submissionDeadline`) est synchronisée ce
 * sprint (mission §24, exemple minimal explicitement cité).
 */
@Injectable()
export class CreateCalendarEventForTenderUseCase {
  constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(CALENDAR_SYNCED_EVENT_REPOSITORY) private readonly calendarSyncedEventRepository: CalendarSyncedEventRepository,
    @Inject(CONNECTOR_PROVIDER_ADAPTERS) private readonly adapters: ConnectorProviderAdapterMap,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly ensureFreshAccessToken: EnsureFreshAccessTokenService,
  ) {}

  async execute(command: CreateCalendarEventForTenderCommand): Promise<CreateCalendarEventForTenderResult> {
    assertHasConnectorPermission(command.actorRole, ConnectorPermission.DocumentExport);

    // Org + ClientAccess + existence du Tender, entièrement délégué (mission §50, même motif que
    // l'export documentaire) — jamais dupliqué ici.
    const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorRole: command.actorRole, actorId: command.actorId });

    const connection = await this.connectionRepository.findById({ organizationId: command.organizationId, connectionId: command.connectionId });
    if (!connection) {
      throw new ExternalConnectionNotFoundError();
    }
    if (!connection.isClientAllowed(tender.clientAccountId)) {
      throw new ExternalConnectionClientNotAllowedError();
    }

    const existing = await this.calendarSyncedEventRepository.findActive({ organizationId: command.organizationId, connectionId: command.connectionId, tenderId: command.tenderId, milestoneId: undefined });
    if (existing) {
      return { externalEventId: existing.externalEventId, alreadyExisted: true };
    }

    if (!tender.submissionDeadline) {
      throw new TenderDeadlineNotSetError();
    }
    const startAt = new Date(tender.submissionDeadline);
    const timezone = tender.submissionDeadlineTimezone ?? DEFAULT_TIMEZONE;

    const accessToken = await this.ensureFreshAccessToken.execute(connection);
    const adapter = getAdapter(this.adapters, connection.provider);
    const created = await adapter.createCalendarEvent(accessToken, {
      title: `TenderOS — Échéance : ${tender.title}`,
      description: `Date limite de remise pour l'appel d'offres « ${tender.title} » (réf. ${tender.reference ?? tender.id}).`,
      startAt,
      endAt: new Date(startAt.getTime() + DEFAULT_EVENT_DURATION_MS),
      timezone,
    });

    const occurredAt = this.clock.now();
    const syncedEvent = CalendarSyncedEvent.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      connectionId: command.connectionId,
      tenderId: command.tenderId,
      externalEventId: created.externalEventId,
      createdBy: command.actorId,
      occurredAt,
    });
    await this.calendarSyncedEventRepository.save(syncedEvent);

    connection.recordSuccessfulSync(occurredAt);
    await this.connectionRepository.save(connection);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "connector.calendar_event_created",
      resourceType: "Tender",
      resourceId: command.tenderId,
      metadata: { provider: connection.provider, connectionId: connection.id },
    });

    return { externalEventId: created.externalEventId, alreadyExisted: false };
  }
}
