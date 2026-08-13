import { BadRequestException, ForbiddenException, type ArgumentsHost, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DomainError } from "./domain-error";
import { GlobalExceptionFilter } from "./global-exception.filter";

class TestDomainError extends DomainError {
  readonly code = "TEST_DOMAIN_ERROR";
}

function buildHost(requestId: string): { host: ArgumentsHost; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const request = { id: requestId, method: "GET", originalUrl: "/api/v1/test" };
  const response = { status };

  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, json, status };
}

describe("GlobalExceptionFilter", () => {
  it("normalizes a ZodValidationPipe BadRequestException into the canonical envelope with requestId", () => {
    const filter = new GlobalExceptionFilter();
    const { host, json, status } = buildHost("req-1");
    const exception = new BadRequestException({
      error: { code: "VALIDATION_FAILED", message: "The request contains invalid fields.", details: { fields: [] } },
    });

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      error: { code: "VALIDATION_FAILED", message: "The request contains invalid fields.", requestId: "req-1" },
    });
  });

  it("normalizes a plain HttpException (e.g. a Guard) using the HTTP status name as the code", () => {
    const filter = new GlobalExceptionFilter();
    const { host, json, status } = buildHost("req-2");
    const exception = new ForbiddenException("Access denied.");

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(json).toHaveBeenCalledWith({
      error: { code: "FORBIDDEN", message: "Access denied.", requestId: "req-2" },
    });
  });

  it("maps an unmapped DomainError to 500 without ever exposing internal details beyond its own message", () => {
    const filter = new GlobalExceptionFilter();
    const { host, json, status } = buildHost("req-3");
    const exception = new TestDomainError("A domain rule was violated.");

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: { code: "TEST_DOMAIN_ERROR", message: "A domain rule was violated.", requestId: "req-3" },
    });
  });

  it("never leaks a stack trace or raw error detail for a genuinely unexpected exception", () => {
    const filter = new GlobalExceptionFilter();
    const { host, json, status } = buildHost("req-4");
    const exception = new Error("some internal database driver detail that must never reach the client");

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred.", requestId: "req-4" },
    });
  });
});
