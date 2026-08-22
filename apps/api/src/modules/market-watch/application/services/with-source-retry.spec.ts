import { describe, expect, it, vi } from "vitest";
import { withSourceRetry } from "./with-source-retry";

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
});
