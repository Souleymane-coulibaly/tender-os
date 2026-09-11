import { describe, expect, it, vi } from "vitest";

const permanentRedirect = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});

vi.mock("next/navigation", () => ({ permanentRedirect: (url: string) => permanentRedirect(url) }));

describe("/app/ai-preferences (ancienne entrée « IA / Modèles »)", () => {
  it("redirects permanently to the « Choix des modèles » tab of Configuration IA", async () => {
    const { default: AiPreferencesRedirectPage } = await import("./page");

    expect(() => AiPreferencesRedirectPage()).toThrow("NEXT_REDIRECT");
    expect(permanentRedirect).toHaveBeenCalledWith("/app/ai-configuration/model-preferences");
  });
});
