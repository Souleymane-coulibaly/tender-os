import { DomainError } from "../../../shared-kernel/domain-error";

export class NotificationNotFoundError extends DomainError {
  readonly code = "NOTIFICATION_NOT_FOUND";
  constructor() {
    super("Notification not found.");
  }
}

/** Checkpoint TENDEROS-2.1-P2.3-E11 — jamais une catégorie devinée/inventée côté HTTP : uniquement
 *  celles réellement câblées au pipeline Outbox (voir `NotificationCategory`). */
export class InvalidNotificationCategoryError extends DomainError {
  readonly code = "INVALID_NOTIFICATION_CATEGORY";
  constructor(category: string) {
    super(`Invalid notification category: ${category}`);
  }
}
