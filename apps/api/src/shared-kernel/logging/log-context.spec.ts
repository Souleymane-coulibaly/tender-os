import { describe, expect, it } from "vitest";
import { getLogContext, runWithLogContext } from "./log-context";

describe("log-context (AsyncLocalStorage)", () => {
  it("returns undefined outside of any established context (e.g. a background worker tick)", () => {
    expect(getLogContext()).toBeUndefined();
  });

  it("makes the context available synchronously within runWithLogContext", () => {
    runWithLogContext({ requestId: "req-1" }, () => {
      expect(getLogContext()).toEqual({ requestId: "req-1" });
    });
  });

  it("propagates the context across an async continuation (await), matching the real middleware -> handler chain", async () => {
    const observed = await runWithLogContext({ requestId: "req-2" }, async () => {
      await Promise.resolve();
      return getLogContext();
    });

    expect(observed).toEqual({ requestId: "req-2" });
  });

  it("never leaks one request's context into a concurrent, unrelated request", async () => {
    const [a, b] = await Promise.all([
      runWithLogContext({ requestId: "req-a" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getLogContext()?.requestId;
      }),
      runWithLogContext({ requestId: "req-b" }, async () => {
        return getLogContext()?.requestId;
      }),
    ]);

    expect(a).toBe("req-a");
    expect(b).toBe("req-b");
  });
});
