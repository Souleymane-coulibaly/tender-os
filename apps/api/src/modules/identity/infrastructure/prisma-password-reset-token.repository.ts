import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { PasswordResetTokenRepository } from "../application/ports/password-reset-token.repository";
import { PasswordResetToken } from "../domain/password-reset-token.entity";

@Injectable()
export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record) {
      return null;
    }

    return PasswordResetToken.rehydrate({
      id: record.id,
      userId: record.userId,
      tokenHash: record.tokenHash,
      expiresAt: record.expiresAt,
      usedAt: record.usedAt ?? undefined,
      createdAt: record.createdAt,
    });
  }

  async save(token: PasswordResetToken): Promise<void> {
    await this.prisma.passwordResetToken.upsert({
      where: { id: token.id },
      create: {
        id: token.id,
        userId: token.userId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt ?? null,
      },
      update: {
        usedAt: token.usedAt ?? null,
      },
    });
  }

  async invalidateActiveForUser(userId: string, occurredAt: Date): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: occurredAt },
    });
  }
}
