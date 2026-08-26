import { Injectable } from "@nestjs/common";
import type { NotificationPreference as PrismaNotificationPreference } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { isNotificationCategory, type NotificationCategory } from "../domain/notification-category";
import { NotificationPreference } from "../domain/notification-preference.entity";
import type { NotificationPreferenceRepository } from "../application/ports/notification-preference.repository";

function toDomain(row: PrismaNotificationPreference): NotificationPreference {
  const category = row.category;
  if (!isNotificationCategory(category)) {
    // Ligne écrite par une version future/inconnue — jamais un crash de lecture, mais jamais
    // silencieusement traitée comme une catégorie connue non plus (voir l'appelant : ce cas ne se
    // produit jamais aujourd'hui car seules les catégories connues sont jamais écrites, correctif
    // défensif si le catalogue évolue).
    throw new Error(`Unknown notification preference category persisted: ${category}`);
  }
  return NotificationPreference.rehydrate({ id: row.id, userId: row.userId, category, emailEnabled: row.emailEnabled, createdAt: row.createdAt, updatedAt: row.updatedAt });
}

@Injectable()
export class PrismaNotificationPreferenceRepository implements NotificationPreferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByUser(userId: string): Promise<NotificationPreference[]> {
    const rows = await this.prisma.currentClient().notificationPreference.findMany({ where: { userId } });
    return rows.map(toDomain);
  }

  async findByUserAndCategory(input: { userId: string; category: NotificationCategory }): Promise<NotificationPreference | null> {
    const row = await this.prisma.currentClient().notificationPreference.findUnique({ where: { userId_category: { userId: input.userId, category: input.category } } });
    return row ? toDomain(row) : null;
  }

  async upsert(preference: NotificationPreference): Promise<void> {
    await this.prisma.currentClient().notificationPreference.upsert({
      where: { userId_category: { userId: preference.userId, category: preference.category } },
      create: { id: preference.id, userId: preference.userId, category: preference.category, emailEnabled: preference.emailEnabled, createdAt: preference.createdAt, updatedAt: preference.updatedAt },
      update: { emailEnabled: preference.emailEnabled, updatedAt: preference.updatedAt },
    });
  }
}
