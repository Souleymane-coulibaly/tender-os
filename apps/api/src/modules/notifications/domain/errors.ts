import { DomainError } from "../../../shared-kernel/domain-error";

export class NotificationNotFoundError extends DomainError {
  readonly code = "NOTIFICATION_NOT_FOUND";
  constructor() {
    super("Notification not found.");
  }
}
