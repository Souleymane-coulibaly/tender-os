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

  /**
   * Hotfix observabilité staging (diagnostic Railway) — régression du bug réel reproduit et prouvé
   * en isolation : `ExceptionHandler.handle(exception)` (NestJS, bootstrap) appelle
   * `logger.error(exception)`, et le `Logger` interne de Nest complète toujours les
   * `optionalParams` avec son `context` (`[undefined].concat(context)` quand `optionalParams` est
   * vide) — produisant exactement les formes A à F ci-dessous. Avant ce correctif, B produisait
   * `{"message":{},"meta":[null]}` sur Railway (l'exception réelle disparaissait des logs).
   */
  describe("Hotfix observabilité staging — préservation des Error natifs de bootstrap NestJS", () => {
    it("A. BLOQUANT — error(Error) alone: the message is visible, never {}", () => {
      const stderrSpy = spyOnWrite(process.stderr);
      const logger = new StructuredLoggerService();

      logger.error(new Error("bootstrap failed"));

      const line = lastWrittenLine(stderrSpy.mock.calls as unknown[][]);
      expect(line.message).toEqual(expect.objectContaining({ name: "Error", message: "bootstrap failed" }));
    });

    it("B. BLOQUANT — error(Error, undefined, context): context set, message preserved, stack preserved, no meta:[null] artifact", () => {
      const stderrSpy = spyOnWrite(process.stderr);
      const logger = new StructuredLoggerService();
      const error = new Error("bootstrap failed");

      logger.error(error, undefined, "ExceptionHandler");

      const line = lastWrittenLine(stderrSpy.mock.calls as unknown[][]);
      expect(line.module).toBe("ExceptionHandler");
      expect((line.message as { message: string }).message).toBe("bootstrap failed");
      expect((line.message as { stack?: string }).stack).toContain("bootstrap failed");
      expect(line.meta).toBeUndefined();
      expect(JSON.stringify(line)).not.toContain("[null]");
    });

    it("C. error(Error, stack, context): message, stack (both as trace and inside message), and context all preserved", () => {
      const stderrSpy = spyOnWrite(process.stderr);
      const logger = new StructuredLoggerService();
      const error = new Error("bootstrap failed");
      const stack = error.stack ?? "Error: bootstrap failed";

      logger.error(error, stack, "ExceptionHandler");

      const line = lastWrittenLine(stderrSpy.mock.calls as unknown[][]);
      expect(line.module).toBe("ExceptionHandler");
      expect((line.message as { message: string }).message).toBe("bootstrap failed");
      expect(line.trace).toBe(stack);
    });

    it("D. error(string, stack, context): historical behavior unchanged — message stays a plain string", () => {
      const stderrSpy = spyOnWrite(process.stderr);
      const logger = new StructuredLoggerService();

      logger.error("bootstrap failed", "stack trace here", "ExceptionHandler");

      const line = lastWrittenLine(stderrSpy.mock.calls as unknown[][]);
      expect(line.message).toBe("bootstrap failed");
      expect(line.trace).toBe("stack trace here");
      expect(line.module).toBe("ExceptionHandler");
    });

    it("E. real application metadata alongside a message is preserved untouched", () => {
      const stdoutSpy = spyOnWrite(process.stdout);
      const logger = new StructuredLoggerService();

      logger.log("Job completed", { jobId: "job-123", attempt: 2 }, "MyWorker");

      const line = lastWrittenLine(stdoutSpy.mock.calls as unknown[][]);
      expect(line.meta).toEqual([{ jobId: "job-123", attempt: 2 }]);
    });

    it("F. a bare technical undefined never produces an artificial null in meta, with or without real metadata alongside it", () => {
      const stdoutSpy = spyOnWrite(process.stdout);
      const logger = new StructuredLoggerService();

      logger.log("solo undefined", undefined);
      const soloLine = lastWrittenLine(stdoutSpy.mock.calls as unknown[][]);
      expect(soloLine.meta).toBeUndefined();
      expect(JSON.stringify(soloLine)).not.toContain("null");

      logger.log("mixed", undefined, { real: "metadata" }, "MyService");
      const mixedLine = lastWrittenLine(stdoutSpy.mock.calls as unknown[][]);
      expect(mixedLine.meta).toEqual([{ real: "metadata" }]);
    });

    it("still redacts a secret found inside an Error's message (defense in depth, same discipline as a plain string message)", () => {
      const stderrSpy = spyOnWrite(process.stderr);
      const logger = new StructuredLoggerService();

      logger.error(new Error("AI provider returned HTTP 401: invalid key sk_live_abcdefghijklmnop"));

      const line = lastWrittenLine(stderrSpy.mock.calls as unknown[][]);
      expect(JSON.stringify(line)).not.toContain("sk_live_abcdefghijklmnop");
    });
  });
});
