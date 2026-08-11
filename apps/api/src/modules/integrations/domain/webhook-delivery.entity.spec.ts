import { describe, expect, it } from "vitest";
import { WebhookDelivery } from "./webhook-delivery.entity";
import { WebhookDeliveryStatus } from "./enums";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function buildDelivery() {
  return WebhookDelivery.create({
    id: "del-1",
    organizationId: "org-1",
    subscriptionId: "sub-1",
    eventId: "evt-1",
    eventType: "response_package.validated",
    payload: { id: "evt-1", type: "response_package.validated" },
    occurredAt: NOW,
  });
}

describe("WebhookDelivery", () => {
  it("starts PENDING with zero attempts", () => {
    const delivery = buildDelivery();
    expect(delivery.status).toBe(WebhookDeliveryStatus.Pending);
    expect(delivery.attemptCount).toBe(0);
  });

  it("markSucceeded transitions to SUCCEEDED and clears the error", () => {
    const delivery = buildDelivery();
    delivery.markDelivering(NOW);
    delivery.markSucceeded({ httpStatus: 200, occurredAt: NOW });
    expect(delivery.status).toBe(WebhookDeliveryStatus.Succeeded);
    expect(delivery.httpStatus).toBe(200);
    expect(delivery.errorSummary).toBeUndefined();
  });

  it("recordFailure on a 500 schedules a RETRYING state with a future nextAvailableAt", () => {
    const delivery = buildDelivery();
    delivery.markDelivering(NOW);
    delivery.recordFailure({ httpStatus: 500, isNetworkOrTimeoutError: false, errorSummary: "server error", occurredAt: NOW });
    expect(delivery.status).toBe(WebhookDeliveryStatus.Retrying);
    expect(delivery.attemptCount).toBe(1);
    expect(delivery.nextAvailableAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("BLOQUANT — recordFailure on a 400 goes straight to DEAD, never RETRYING (mission §41/§108)", () => {
    const delivery = buildDelivery();
    delivery.markDelivering(NOW);
    delivery.recordFailure({ httpStatus: 400, isNetworkOrTimeoutError: false, errorSummary: "bad request", occurredAt: NOW });
    expect(delivery.status).toBe(WebhookDeliveryStatus.Dead);
  });

  it("BLOQUANT — after reaching max attempts on retryable failures, moves to DEAD (mission §42/§110)", () => {
    const delivery = buildDelivery();
    for (let i = 0; i < 8; i += 1) {
      delivery.markDelivering(NOW);
      delivery.recordFailure({ httpStatus: 500, isNetworkOrTimeoutError: false, errorSummary: "server error", occurredAt: NOW });
    }
    expect(delivery.status).toBe(WebhookDeliveryStatus.Dead);
    expect(delivery.attemptCount).toBe(8);
  });

  it("BLOQUANT — audit Codex INT-P1-01 : a refused redirect (3xx) goes straight to DEAD, never RETRYING", () => {
    const delivery = buildDelivery();
    delivery.markDelivering(NOW);
    // `DeliverWebhookService` envoie avec `redirect: "manual"` — une redirection refusée arrive
    // ici avec son vrai code 3xx (jamais suivie), classé non-retryable comme tout statut < 500
    // hors 429 (même policy qu'un 400, sans code additionnel).
    delivery.recordFailure({ httpStatus: 302, isNetworkOrTimeoutError: false, errorSummary: "HTTP 302", occurredAt: NOW });
    expect(delivery.status).toBe(WebhookDeliveryStatus.Dead);
    expect(delivery.attemptCount).toBe(1);
  });

  it("scheduleManualRetry requeues immediately (mission §43/§111)", () => {
    const delivery = buildDelivery();
    delivery.markDelivering(NOW);
    delivery.recordFailure({ httpStatus: 400, isNetworkOrTimeoutError: false, errorSummary: "bad request", occurredAt: NOW });
    expect(delivery.status).toBe(WebhookDeliveryStatus.Dead);

    delivery.scheduleManualRetry(NOW);
    expect(delivery.status).toBe(WebhookDeliveryStatus.Pending);
    expect(delivery.nextAvailableAt).toEqual(NOW);
  });
});
