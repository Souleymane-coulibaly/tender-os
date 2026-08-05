import { describe, expect, it } from "vitest";
import { computeOutboxBackoffSeconds, OUTBOX_MAX_ATTEMPTS } from "./outbox-event-status";

describe("computeOutboxBackoffSeconds", () => {
  it("grows exponentially with the attempt count", () => {
    expect(computeOutboxBackoffSeconds(1)).toBe(30);
    expect(computeOutboxBackoffSeconds(2)).toBe(60);
    expect(computeOutboxBackoffSeconds(3)).toBe(120);
  });

  it("caps the backoff at one hour", () => {
    expect(computeOutboxBackoffSeconds(20)).toBe(3600);
  });

  it("never returns a negative or zero delay for the first attempt", () => {
    expect(computeOutboxBackoffSeconds(0)).toBeGreaterThan(0);
  });
});

describe("OUTBOX_MAX_ATTEMPTS", () => {
  it("is a positive finite threshold", () => {
    expect(OUTBOX_MAX_ATTEMPTS).toBeGreaterThan(0);
  });
});
