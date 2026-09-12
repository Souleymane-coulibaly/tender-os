import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PageGuideAction } from "../../lib/page-guide-runtime";

const appApiFetch = vi.fn();
vi.mock("../../lib/app-api-client", () => ({ appApiFetch: (...args: unknown[]) => appApiFetch(...args) }));

const { fetchSeenPageGuides, recordPageGuideAction } = await import("./page-guide-actions");

beforeEach(() => {
  appApiFetch.mockReset();
});

describe("fetchSeenPageGuides", () => {
  it("renvoie les clés terminées ou ignorées", async () => {
    appApiFetch.mockResolvedValue({ items: [{ guideKey: "tenders", completedAt: "2026-09-01T00:00:00.000Z" }, { guideKey: "knowledge" }] });
    await expect(fetchSeenPageGuides()).resolves.toEqual(["tenders"]);
    expect(appApiFetch).toHaveBeenCalledWith("/api/v1/auth/me/page-guides");
  });

  it("état inconnu (erreur ou réponse inattendue) → null, jamais d'exception", async () => {
    appApiFetch.mockRejectedValue(new Error("API indisponible"));
    await expect(fetchSeenPageGuides()).resolves.toBeNull();
    appApiFetch.mockResolvedValue(null);
    await expect(fetchSeenPageGuides()).resolves.toBeNull();
  });
});

describe("recordPageGuideAction", () => {
  it("POST l'action sur la clé du guide", async () => {
    appApiFetch.mockResolvedValue({ guideKey: "tenders", completedAt: "2026-09-01T00:00:00.000Z" });
    await expect(recordPageGuideAction("tenders", "COMPLETE")).resolves.toEqual({});
    expect(appApiFetch).toHaveBeenCalledWith("/api/v1/auth/me/page-guides/tenders", { method: "POST", body: JSON.stringify({ action: "COMPLETE" }) });
  });

  it("refuse une clé ou une action invalide sans appeler l'API", async () => {
    await expect(recordPageGuideAction("../admin", "DISMISS")).resolves.toEqual({ error: "Guide inconnu." });
    await expect(recordPageGuideAction("tenders", "START" as PageGuideAction)).resolves.toEqual({ error: "Guide inconnu." });
    expect(appApiFetch).not.toHaveBeenCalled();
  });

  it("un échec API renvoie { error }, jamais une exception", async () => {
    appApiFetch.mockRejectedValue(new Error("500"));
    await expect(recordPageGuideAction("tenders", "DISMISS")).resolves.toEqual({ error: "Une erreur est survenue." });
  });
});
