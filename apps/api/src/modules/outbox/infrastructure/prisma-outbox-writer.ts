import { Injectable } from "@nestjs/common";
import type { OutboxEventInput, OutboxTransaction, OutboxWriter } from "../application/ports/outbox-writer";
import { PrismaOutboxEventRepository } from "./prisma-outbox-event.repository";

@Injectable()
export class PrismaOutboxWriter implements OutboxWriter {
  constructor(private readonly repository: PrismaOutboxEventRepository) {}

  async write(input: { organizationId: string; events: OutboxEventInput[] }, tx?: OutboxTransaction): Promise<void> {
    await this.repository.insertMany(input, tx);
  }
}
