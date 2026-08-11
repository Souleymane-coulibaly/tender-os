import { DomainError } from "../../../shared-kernel/domain-error";

export class ApiKeyNotFoundError extends DomainError {
  readonly code = "API_KEY_NOT_FOUND";
  constructor() {
    super("API key not found.");
  }
}

export class InvalidApiKeyScopeError extends DomainError {
  readonly code = "INVALID_API_KEY_SCOPE";
  constructor(scope: string) {
    super(`"${scope}" is not a recognized API key scope.`);
  }
}

export class InvalidApiKeyClientScopeError extends DomainError {
  readonly code = "INVALID_API_KEY_CLIENT_SCOPE";
  constructor() {
    super("One or more clientAccountIds do not belong to this organization.");
  }
}

/** Anti-énumération (mission §101/§102) — jamais distingué de "clé introuvable" côté HTTP externe. */
export class ApiKeyAuthenticationFailedError extends DomainError {
  readonly code = "API_KEY_AUTHENTICATION_FAILED";
  constructor() {
    super("Invalid, revoked, or expired API key.");
  }
}

export class ApiKeyScopeMissingError extends DomainError {
  readonly code = "API_KEY_SCOPE_MISSING";
  constructor(scope: string) {
    super(`This API key does not have the required scope: ${scope}.`);
  }
}

export class WebhookSubscriptionNotFoundError extends DomainError {
  readonly code = "WEBHOOK_SUBSCRIPTION_NOT_FOUND";
  constructor() {
    super("Webhook subscription not found.");
  }
}

export class WebhookDeliveryNotFoundError extends DomainError {
  readonly code = "WEBHOOK_DELIVERY_NOT_FOUND";
  constructor() {
    super("Webhook delivery not found.");
  }
}

export class InvalidWebhookEventTypeError extends DomainError {
  readonly code = "INVALID_WEBHOOK_EVENT_TYPE";
  constructor(eventType: string) {
    super(`"${eventType}" is not a recognized webhook event type.`);
  }
}

/** Mission §31 — SSRF critique : rejette toute endpointUrl visant un réseau interne, un service de
 *  métadonnées cloud, ou un protocole non HTTP(S), à la création ET à chaque livraison (mission
 *  §29/§95, défense en profondeur contre le DNS rebinding). */
export class UnsafeWebhookEndpointUrlError extends DomainError {
  readonly code = "UNSAFE_WEBHOOK_ENDPOINT_URL";
  constructor(reason: string) {
    super(`This endpoint URL is not allowed: ${reason}.`);
  }
}

export class WebhookDeliveryNotRetryableError extends DomainError {
  readonly code = "WEBHOOK_DELIVERY_NOT_RETRYABLE";
  constructor() {
    super("This delivery already succeeded or is not in a retryable state.");
  }
}
