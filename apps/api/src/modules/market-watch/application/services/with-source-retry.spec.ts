import { describe, expect, it, vi } from "vitest";
import { MarketSourceHttpError, withSourceRetry } from "./with-source-retry";

describe("withSourceRetry — mission §27", () => {
  it("returns the result on the first successful attempt without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withSourceRetry(fn, { delayMs: 0 });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("BLOQUANT — a transient failure is retried and can still succeed (a timeout/429 never fails the whole cycle on the first attempt)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("ok");

    const result = await withSourceRetry(fn, { delayMs: 0 });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured number of attempts and rethrows the last error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("still down"));

    await expect(withSourceRetry(fn, { attempts: 3, delayMs: 0 })).rejects.toThrow("still down");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  // Checkpoint TENDEROS-2.1-P2.3-E12 (mission §42 TRANSIENT vs PERMANENT).
  it("BLOQUANT — a PERMANENT failure (HTTP 400) is never retried: rejouer un payload invalide ne peut pas réussir", async () => {
    const fn = vi.fn().mockRejectedValue(new MarketSourceHttpError("BOAMP", 400));

    await expect(withSourceRetry(fn, { attempts: 3, delayMs: 0 })).rejects.toBeInstanceOf(MarketSourceHttpError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("BLOQUANT — 429 (rate limit) stays TRANSIENT despite being a 4xx", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new MarketSourceHttpError("BOAMP", 429)).mockResolvedValueOnce("ok");

    await expect(withSourceRetry(fn, { delayMs: 0 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a 5xx provider failure remains retryable", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new MarketSourceHttpError("TED", 503)).mockResolvedValueOnce("ok");

    await expect(withSourceRetry(fn, { delayMs: 0 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
