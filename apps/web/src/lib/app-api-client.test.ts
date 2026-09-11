import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieValues: Record<string, string> = {
  tenderos_app_session: "session-token",
  tenderos_app_organization_id: "org-1",
};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieValues[name] ? { value: cookieValues[name] } : undefined),
  }),
}));

const { AppApiError, appApiFetch, appApiFetchWithToken } = await import("./app-api-client");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("appApiFetch", () => {
  it("returns null for a 200 with an empty body — a route answering `null` for an optional resource not created yet", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));
    await expect(appApiFetch("/api/v1/tenders/t-1/administrative-consortium")).resolves.toBeNull();
  });

  it("parses a JSON body and sends the session and organization headers", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "c-1" }), { status: 200 }));
    await expect(appApiFetch("/api/v1/x")).resolves.toEqual({ id: "c-1" });
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer session-token");
    expect(headers["X-Organization-Id"]).toBe("org-1");
  });

  it("returns undefined for a 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(appApiFetch("/api/v1/x", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("throws an AppApiError carrying the API status and code", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "TENDER_NOT_FOUND", message: "Not found." } }), { status: 404 }),
    );
    const error = await appApiFetch("/api/v1/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppApiError);
    expect(error).toMatchObject({ status: 404, code: "TENDER_NOT_FOUND" });
  });
});

describe("appApiFetchWithToken", () => {
  it("returns null for a 200 with an empty body as well", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));
    await expect(appApiFetchWithToken("token", "/api/v1/x")).resolves.toBeNull();
  });
});
