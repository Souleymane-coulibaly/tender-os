import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { isNotificationCategory } from "../../domain/notification-category";
import { InvalidNotificationCategoryError } from "../../domain/errors";
import { NotificationPreference } from "../../domain/notification-preference.entity";
import { NOTIFICATION_PREFERENCE_REPOSITORY, type NotificationPreferenceRepository } from "../ports/notification-preference.repository";
import type { NotificationPreferenceSummary } from "./get-notification-preferences.use-case";

export type UpdateNotificationPreferenceCommand = Readonly<{ userId: string; category: string; emailEnabled: boolean }>;

/** Mission §21 — `userId` vient TOUJOURS de l'acteur authentifié (jamais un paramètre de route/
 *  body) : cette signature ne permet structurellement pas à un utilisateur de modifier la
 *  préférence d'un autre, même OWNER/ORGANIZATION_ADMIN (voir le contrôleur, qui ne lit jamais
 *  `userId` ailleurs que dans `@CurrentActor()`). */
@Injectable()
export class UpdateNotificationPreferenceUseCase {
  constructor(
    @Inject(NOTIFICATION_PREFERENCE_REPOSITORY) private readonly repository: NotificationPreferenceRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateNotificationPreferenceCommand): Promise<NotificationPreferenceSummary> {
    if (!isNotificationCategory(command.category)) {
      throw new InvalidNotificationCategoryError(command.category);
    }
    const now = this.clock.now();
    const existing = await this.repository.findByUserAndCategory({ userId: command.userId, category: command.category });

    if (existing) {
      existing.setEmailEnabled(command.emailEnabled, now);
      await this.repository.upsert(existing);
      return { category: existing.category, emailEnabled: existing.emailEnabled };
    }

    const created = NotificationPreference.create({ id: this.idGenerator.generate(), userId: command.userId, category: command.category, emailEnabled: command.emailEnabled, occurredAt: now });
    await this.repository.upsert(created);
    return { category: created.category, emailEnabled: created.emailEnabled };
  }
}
