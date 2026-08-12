import { Injectable } from "@nestjs/common";
import type { CalendarSyncedEvent as CalendarSyncedEventRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { CalendarSyncedEvent } from "../domain/calendar-synced-event.entity";
import type { CalendarSyncedEventRepository } from "../application/ports/calendar-synced-event.repository";

function toDomain(record: CalendarSyncedEventRecord): CalendarSyncedEvent {
  return CalendarSyncedEvent.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    connectionId: record.connectionId,
    tenderId: record.tenderId,
    milestoneId: record.milestoneId ?? undefined,
    externalEventId: record.externalEventId,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    deletedAt: record.deletedAt ?? undefined,
  });
}

@Injectable()
export class PrismaCalendarSyncedEventRepository implements CalendarSyncedEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActive(input: { organizationId: string; connectionId: string; tenderId: string; milestoneId?: string | undefined }): Promise<CalendarSyncedEvent | null> {
    const record = await this.prisma.currentClient().calendarSyncedEvent.findFirst({
      where: { organizationId: input.organizationId, connectionId: input.connectionId, tenderId: input.tenderId, milestoneId: input.milestoneId ?? null, deletedAt: null },
    });
    return record ? toDomain(record) : null;
  }

  async save(event: CalendarSyncedEvent): Promise<void> {
    const data = {
      id: event.id,
      organizationId: event.organizationId,
      connectionId: event.connectionId,
      tenderId: event.tenderId,
      milestoneId: event.milestoneId ?? null,
      externalEventId: event.externalEventId,
      createdBy: event.createdBy,
      deletedAt: event.deletedAt ?? null,
    };
    await this.prisma.currentClient().calendarSyncedEvent.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
