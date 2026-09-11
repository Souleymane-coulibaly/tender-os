// @vitest-environment node
import { describe, expect, it } from "vitest";
import { asApiError, isNetworkFailure } from "./page-load-error";

describe("asApiError", () => {
  it("reconnaît une erreur d'API par sa forme, même hors de toute classe (module dupliqué par Next.js)", () => {
    const fromAnotherModuleInstance = Object.assign(new Error("Forbidden"), { status: 403, code: "FORBIDDEN" });
    expect(asApiError(fromAnotherModuleInstance)).toEqual({ status: 403, code: "FORBIDDEN" });
  });

  it("ne prend jamais une erreur quelconque pour une réponse de l'API", () => {
    expect(asApiError(new Error("boom"))).toBeUndefined();
    expect(asApiError({ status: "500", code: "X" })).toBeUndefined();
    expect(asApiError(undefined)).toBeUndefined();
  });
});

describe("isNetworkFailure", () => {
  it("reconnaît l'échec de fetch de Node (« fetch failed »)", () => {
    expect(isNetworkFailure(new TypeError("fetch failed"))).toBe(true);
  });

  it("reconnaît une connexion refusée, en cause directe ou imbriquée (AggregateError)", () => {
    const direct = Object.assign(new Error("connect"), { cause: { code: "ECONNREFUSED" } });
    const nested = new Error("connect", { cause: new AggregateError([Object.assign(new Error("a"), { code: "ECONNREFUSED" })]) });
    expect(isNetworkFailure(direct)).toBe(true);
    expect(isNetworkFailure(nested)).toBe(true);
  });

  it("ne confond pas une erreur de code avec une panne réseau", () => {
    expect(isNetworkFailure(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isNetworkFailure({ status: 500, code: "INTERNAL_SERVER_ERROR" })).toBe(false);
  });
});
