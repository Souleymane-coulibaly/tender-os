import { describe, expect, it } from "vitest";
import { computeWebhookDeliveryBackoffSeconds, hasReachedMaxAttempts, isRetryableDeliveryOutcome } from "./webhook-retry-policy";

describe("isRetryableDeliveryOutcome — mission §41/§105/§108/§109", () => {
  it("retries on network/timeout errors", () => {
    expect(isRetryableDeliveryOutcome({ isNetworkOrTimeoutError: true })).toBe(true);
  });

  it("retries on 429", () => {
    expect(isRetryableDeliveryOutcome({ httpStatus: 429, isNetworkOrTimeoutError: false })).toBe(true);
  });

  it("retries on any 5xx", () => {
    expect(isRetryableDeliveryOutcome({ httpStatus: 500, isNetworkOrTimeoutError: false })).toBe(true);
    expect(isRetryableDeliveryOutcome({ httpStatus: 503, isNetworkOrTimeoutError: false })).toBe(true);
  });

  it("BLOQUANT — does not retry other 4xx (mission §41 never retry indefinitely)", () => {
    expect(isRetryableDeliveryOutcome({ httpStatus: 400, isNetworkOrTimeoutError: false })).toBe(false);
    expect(isRetryableDeliveryOutcome({ httpStatus: 401, isNetworkOrTimeoutError: false })).toBe(false);
    expect(isRetryableDeliveryOutcome({ httpStatus: 404, isNetworkOrTimeoutError: false })).toBe(false);
  });

  it("accepts 2xx trivially as non-retryable context (success is handled separately, never called with 2xx in practice)", () => {
    expect(isRetryableDeliveryOutcome({ httpStatus: 200, isNetworkOrTimeoutError: false })).toBe(false);
  });
});

describe("computeWebhookDeliveryBackoffSeconds — mission §40 example schedule", () => {
  it("follows an increasing schedule capped at 6h", () => {
    expect(computeWebhookDeliveryBackoffSeconds(1)).toBe(60);
    expect(computeWebhookDeliveryBackoffSeconds(2)).toBe(300);
    expect(computeWebhookDeliveryBackoffSeconds(3)).toBe(1800);
    expect(computeWebhookDeliveryBackoffSeconds(4)).toBe(7200);
    expect(computeWebhookDeliveryBackoffSeconds(5)).toBe(21600);
    expect(computeWebhookDeliveryBackoffSeconds(99)).toBe(21600);
  });
});

describe("hasReachedMaxAttempts — mission §42", () => {
  it("is false below the max, true at/after the max", () => {
    expect(hasReachedMaxAttempts(1)).toBe(false);
    expect(hasReachedMaxAttempts(7)).toBe(false);
    expect(hasReachedMaxAttempts(8)).toBe(true);
    expect(hasReachedMaxAttempts(9)).toBe(true);
  });
});
