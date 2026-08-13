import { afterEach, describe, expect, it, vi } from "vitest";
import { runWithLogContext } from "./log-context";
import { StructuredLoggerService } from "./structured-logger.service";

function spyOnWrite(stream: NodeJS.WriteStream) {
  return vi.spyOn(stream, "write").mockImplementation(() => true);
}

function lastWrittenLine(calls: unknown[][]): Record<string, unknown> {
  const call = calls[calls.length - 1];
  const written = call?.[0] as string;
  return JSON.parse(written.trim()) as Record<string, unknown>;
}

describe("StructuredLoggerService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes a JSON line with timestamp/level/message/module (context) on stdout for log()", () => {
    const stdoutSpy = spyOnWrite(process.stdout);
    const stderrSpy = spyOnWrite(process.stderr);
    const logger = new StructuredLoggerService();

    logger.log("Worker started", "MyWorker");

    const line = lastWrittenLine(stdoutSpy.mock.calls as unknown[][]);
    expect(line.level).toBe("log");
    expect(line.message).toBe("Worker started");
    expect(line.module).toBe("MyWorker");
    expect(typeof line.timestamp).toBe("string");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("writes error() and warn() to stderr, never stdout", () => {
    const stdoutSpy = spyOnWrite(process.stdout);
    const stderrSpy = spyOnWrite(process.stderr);
    const logger = new StructuredLoggerService();

    logger.error("Something failed", "stack trace here", "MyService");
    logger.warn("Slow query", "MyService");

    expect(stderrSpy).toHaveBeenCalledTimes(2);
    expect(stdoutSpy).not.toHaveBeenCalled();
    const errorLine = lastWrittenLine([stderrSpy.mock.calls[0] as unknown[]]);
    expect(errorLine.trace).toBe("stack trace here");
    expect(errorLine.module).toBe("MyService");
  });

  it("BLOQUANT (mission §51) — attaches the requestId established by the surrounding AsyncLocalStorage context", () => {
    const stdoutSpy = spyOnWrite(process.stdout);
    const logger = new StructuredLoggerService();

    runWithLogContext({ requestId: "req-123" }, () => {
      logger.log("Handling request", "MyController");
    });

    const line = lastWrittenLine(stdoutSpy.mock.calls as unknown[][]);
    expect(line.requestId).toBe("req-123");
  });

  it("never fails and simply omits requestId when no context is active (e.g. a background worker)", () => {
    const stdoutSpy = spyOnWrite(process.stdout);
    const logger = new StructuredLoggerService();

    logger.log("Tick", "MyWorker");

    const line = lastWrittenLine(stdoutSpy.mock.calls as unknown[][]);
    expect(line.requestId).toBeUndefined();
  });

  it("BLOQUANT (mission §19) — never leaks a secret found in the message or meta into the written line", () => {
    const stderrSpy = spyOnWrite(process.stderr);
    const logger = new StructuredLoggerService();

    logger.error("AI provider returned HTTP 401: invalid key sk_live_abcdefghijklmnop", undefined, "MyService");

    const line = lastWrittenLine(stderrSpy.mock.calls as unknown[][]);
    expect(JSON.stringify(line)).not.toContain("sk_live_abcdefghijklmnop");
  });

  it("redacts sensitive keys inside a meta object passed as an extra param", () => {
    const stdoutSpy = spyOnWrite(process.stdout);
    const logger = new StructuredLoggerService();

    logger.log("Outbound call", { headers: { Authorization: "Bearer secret-token" } }, "MyService");

    const line = lastWrittenLine(stdoutSpy.mock.calls as unknown[][]);
    expect(JSON.stringify(line)).not.toContain("secret-token");
  });
});
