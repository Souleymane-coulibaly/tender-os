import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SessionRepository } from "../application/ports/session.repository";
import { Session } from "../domain/session.entity";

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Session | null> {
    const record = await this.prisma.session.findUnique({ where: { id } });

    if (!record) {
      return null;
    }

    return Session.rehydrate({
      id: record.id,
      userId: record.userId,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt ?? undefined,
    });
  }

  async save(session: Session): Promise<void> {
    await this.prisma.session.upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        userId: session.userId,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt ?? null,
      },
      update: {
        revokedAt: session.revokedAt ?? null,
      },
    });
  }

  async revokeAllForUser(userId: string, occurredAt: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: occurredAt },
    });
  }
}
