import { describe, expect, it } from "vitest";
import {
  AiAuthenticationFailedError,
  AiInvalidResponseError,
  AiProviderNotConfiguredError,
  AiProviderUnavailableError,
  AiRateLimitedError,
  AiSchemaValidationFailedError,
  AiTimeoutError,
} from "../../domain/errors";
import { isRetryableAiError } from "./ai-error-classification";

describe("isRetryableAiError", () => {
  it("treats timeout, rate limit and provider-unavailable as retryable", () => {
    expect(isRetryableAiError(new AiTimeoutError({ timeoutMs: 1000 }))).toBe(true);
    expect(isRetryableAiError(new AiRateLimitedError())).toBe(true);
    expect(isRetryableAiError(new AiProviderUnavailableError({ reason: "503" }))).toBe(true);
  });

  it("treats authentication, invalid response, schema failure and missing config as non-retryable", () => {
    expect(isRetryableAiError(new AiAuthenticationFailedError())).toBe(false);
    expect(isRetryableAiError(new AiInvalidResponseError({ reason: "bad" }))).toBe(false);
    expect(isRetryableAiError(new AiSchemaValidationFailedError({ reason: "bad" }))).toBe(false);
    expect(isRetryableAiError(new AiProviderNotConfiguredError({ reason: "no key" }))).toBe(false);
  });

  it("treats an unrelated error as non-retryable", () => {
    expect(isRetryableAiError(new Error("unrelated"))).toBe(false);
  });
});
