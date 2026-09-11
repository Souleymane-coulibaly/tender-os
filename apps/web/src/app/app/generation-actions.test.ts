import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();
const revalidatePathMock = vi.fn();
const appApiFetchMock = vi.fn();

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

class FakeAppApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppApiError";
  }
}

vi.mock("../../lib/app-api-client", () => ({
  AppApiError: FakeAppApiError,
  appApiFetch: appApiFetchMock,
}));

const {
  createPromptTemplateAction,
  createPromptVersionAction,
  activatePromptVersionAction,
  archivePromptTemplateAction,
  launchGenerationAction,
  retryGenerationAction,
  regenerateGenerationAction,
  cancelGenerationAction,
  editGenerationAction,
  validateGenerationAction,
  rejectGenerationAction,
} = await import("./generation-actions");

/**
 * Correctif Sprint 6 (audit Codex P2-4 — "tests frontend insuffisants") — couvre le contrat réel
 * entre les server actions Generation et l'API backend : validation avant tout appel réseau,
 * construction du payload, et mapping d'erreur HTTP → message français compréhensible (jamais une
 * pile d'appel ou un code Prisma brut exposé au frontend).
 */
describe("generation-actions", () => {
  beforeEach(() => {
    appApiFetchMock.mockReset();
    redirectMock.mockReset();
    revalidatePathMock.mockReset();
  });

  describe("createPromptTemplateAction", () => {
    it("rejects a missing taskType before ever calling the API", async () => {
      const formData = new FormData();
      formData.set("name", "Synthèse");
      formData.set("outputMode", "FREE_TEXT");

      const result = await createPromptTemplateAction({}, formData);

      expect(result.error).toBe("Sélectionnez un type de tâche.");
      expect(appApiFetchMock).not.toHaveBeenCalled();
    });

    it("sends taskType/name/outputMode and redirects to the created template", async () => {
      appApiFetchMock.mockResolvedValue({ id: "template-1" });
      const formData = new FormData();
      formData.set("taskType", "EXECUTIVE_SUMMARY");
      formData.set("name", "Synthèse");
      formData.set("outputMode", "FREE_TEXT");

      await createPromptTemplateAction({}, formData);

      expect(appApiFetchMock).toHaveBeenCalledWith(
        "/api/v1/prompt-templates",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ taskType: "EXECUTIVE_SUMMARY", name: "Synthèse", outputMode: "FREE_TEXT" }) }),
      );
      expect(redirectMock).toHaveBeenCalledWith("/app/ai-configuration/prompts/template-1");
    });

    it("maps a 409 DUPLICATE_PROMPT_TEMPLATE to a comprehensible French message", async () => {
      appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "DUPLICATE_PROMPT_TEMPLATE", "conflict"));
      const formData = new FormData();
      formData.set("taskType", "EXECUTIVE_SUMMARY");
      formData.set("name", "Synthèse");
      formData.set("outputMode", "FREE_TEXT");

      const result = await createPromptTemplateAction({}, formData);

      expect(result.error).toBe("Un modèle de prompt existe déjà pour ce type de contenu dans votre organisation.");
      expect(redirectMock).not.toHaveBeenCalled();
    });
  });

  describe("createPromptVersionAction", () => {
    it("rejects an empty systemPrompt before ever calling the API", async () => {
      const formData = new FormData();
      formData.set("systemPrompt", "  ");
      formData.set("userPromptTemplate", "U");

      const result = await createPromptVersionAction("template-1", {}, formData);

      expect(result.error).toBe("Le prompt système est obligatoire.");
      expect(appApiFetchMock).not.toHaveBeenCalled();
    });

    it("submits the version bound to the template id, with an empty requiredVariables array", async () => {
      appApiFetchMock.mockResolvedValue({ id: "version-1", status: "DRAFT" });
      const formData = new FormData();
      formData.set("systemPrompt", "S");
      formData.set("userPromptTemplate", "U");

      await createPromptVersionAction("template-1", {}, formData);

      expect(appApiFetchMock).toHaveBeenCalledWith(
        "/api/v1/prompt-templates/template-1/versions",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ systemPrompt: "S", userPromptTemplate: "U", requiredVariables: [] }) }),
      );
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/ai-configuration/prompts/template-1");
    });
  });

  describe("activatePromptVersionAction / archivePromptTemplateAction", () => {
    it("activates a version and revalidates the template page", async () => {
      appApiFetchMock.mockResolvedValue({ status: "ACTIVE" });

      const result = await activatePromptVersionAction("template-1", "version-1");

      expect(appApiFetchMock).toHaveBeenCalledWith("/api/v1/prompt-templates/template-1/versions/version-1/activate", { method: "POST" });
      expect(result.error).toBeUndefined();
    });

    it("maps a 409 PROMPT_VERSION_ACTIVATION_CONFLICT to a comprehensible French message", async () => {
      appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "PROMPT_VERSION_ACTIVATION_CONFLICT", "conflict"));

      const result = await activatePromptVersionAction("template-1", "version-1");

      expect(result.error).toBe("Une autre activation de ce modèle est en cours. Réessayez dans un instant.");
    });

    it("archives a template and revalidates both the list and the detail page", async () => {
      appApiFetchMock.mockResolvedValue(undefined);

      await archivePromptTemplateAction("template-1");

      expect(appApiFetchMock).toHaveBeenCalledWith("/api/v1/prompt-templates/template-1/archive", { method: "POST" });
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/ai-configuration/prompts");
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/ai-configuration/prompts/template-1");
    });
  });

  describe("launchGenerationAction", () => {
    it("sends the taskType and returns the created generation id", async () => {
      appApiFetchMock.mockResolvedValue({ id: "gen-1" });

      const result = await launchGenerationAction("tender-1", "EXECUTIVE_SUMMARY");

      expect(appApiFetchMock).toHaveBeenCalledWith(
        "/api/v1/tenders/tender-1/generations",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ taskType: "EXECUTIVE_SUMMARY" }) }),
      );
      expect(result.generationId).toBe("gen-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1/generations");
    });

    it("correctif P1-1 (audit Codex) — maps 409 GENERATION_ALREADY_RUNNING to a comprehensible French message (never a raw backend code)", async () => {
      appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "GENERATION_ALREADY_RUNNING", "already running"));

      const result = await launchGenerationAction("tender-1", "EXECUTIVE_SUMMARY");

      expect(result.error).toBe("Une génération est déjà en cours pour ce contenu.");
      expect(result.generationId).toBeUndefined();
    });

    it("maps a 409 NO_ACTIVE_ROUTING_POLICY (correctif Sprint 6, audit Codex P1-1) to a generic but non-technical conflict message", async () => {
      appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "NO_ACTIVE_ROUTING_POLICY", "no active policy"));

      const result = await launchGenerationAction("tender-1", "EXECUTIVE_SUMMARY");

      expect(result.error).toBe("Aucune règle de choix du modèle n'est active pour ce contenu. Demandez à un administrateur d'en activer une.");
      expect(result.error).not.toContain("NO_ACTIVE_ROUTING_POLICY");
    });

    it("maps an unexpected non-AppApiError to a network error message, never exposing the raw error", async () => {
      appApiFetchMock.mockRejectedValue(new Error("ECONNRESET"));

      const result = await launchGenerationAction("tender-1", "EXECUTIVE_SUMMARY");

      expect(result.error).toBe("Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.");
      expect(result.error).not.toContain("ECONNRESET");
    });
  });

  describe("retry/regenerate/cancel/edit/validate generation actions", () => {
    it("retryGenerationAction posts to the retry endpoint and revalidates the tender's generations page", async () => {
      appApiFetchMock.mockResolvedValue(undefined);
      await retryGenerationAction("tender-1", "gen-1");
      expect(appApiFetchMock).toHaveBeenCalledWith("/api/v1/generations/gen-1/retry", { method: "POST" });
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1/generations");
    });

    it("regenerateGenerationAction posts to the regenerate endpoint", async () => {
      appApiFetchMock.mockResolvedValue(undefined);
      await regenerateGenerationAction("tender-1", "gen-1");
      expect(appApiFetchMock).toHaveBeenCalledWith("/api/v1/generations/gen-1/regenerate", { method: "POST" });
    });

    it("cancelGenerationAction posts to the cancel endpoint", async () => {
      appApiFetchMock.mockResolvedValue(undefined);
      await cancelGenerationAction("tender-1", "gen-1");
      expect(appApiFetchMock).toHaveBeenCalledWith("/api/v1/generations/gen-1/cancel", { method: "POST" });
    });

    it("editGenerationAction sends the edited content as a PATCH", async () => {
      appApiFetchMock.mockResolvedValue(undefined);
      await editGenerationAction("tender-1", "gen-1", "Nouveau contenu");
      expect(appApiFetchMock).toHaveBeenCalledWith(
        "/api/v1/generations/gen-1/edit",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ editedContent: "Nouveau contenu" }) }),
      );
    });

    it("validateGenerationAction posts to the validate endpoint", async () => {
      appApiFetchMock.mockResolvedValue(undefined);
      await validateGenerationAction("tender-1", "gen-1");
      expect(appApiFetchMock).toHaveBeenCalledWith("/api/v1/generations/gen-1/validate", { method: "POST" });
    });
  });

  /** Réaudit Codex P1 — "le rejet d'une génération est absent". */
  describe("rejectGenerationAction", () => {
    it("posts to the reject endpoint with the reason and revalidates the tender's generations page", async () => {
      appApiFetchMock.mockResolvedValue(undefined);

      await rejectGenerationAction("tender-1", "gen-1", "Hors sujet");

      expect(appApiFetchMock).toHaveBeenCalledWith(
        "/api/v1/generations/gen-1/reject",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Hors sujet" }) }),
      );
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/tenders/tender-1/generations");
    });

    it("sends an empty body when no reason is given, never a fabricated one", async () => {
      appApiFetchMock.mockResolvedValue(undefined);

      await rejectGenerationAction("tender-1", "gen-1");

      const call = appApiFetchMock.mock.calls[0]!;
      expect((call[1] as { body: string }).body).toBe(JSON.stringify({}));
    });

    it("maps a 409 GENERATION_ALREADY_VALIDATED to a comprehensible French message", async () => {
      appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "GENERATION_ALREADY_VALIDATED", "already validated"));

      const result = await rejectGenerationAction("tender-1", "gen-1");

      expect(result.error).toBe("Cette génération a déjà été validée : elle ne peut plus être rejetée.");
    });

    it("maps a 409 GENERATION_NOT_REJECTABLE to a comprehensible French message", async () => {
      appApiFetchMock.mockRejectedValue(new FakeAppApiError(409, "GENERATION_NOT_REJECTABLE", "wrong status"));

      const result = await rejectGenerationAction("tender-1", "gen-1");

      expect(result.error).toBe("Seule une génération terminée avec succès peut être rejetée.");
    });

    it("maps a 404 to a comprehensible French message (cross-tenant/cross-client)", async () => {
      appApiFetchMock.mockRejectedValue(new FakeAppApiError(404, "GENERATION_NOT_FOUND", "not found"));

      const result = await rejectGenerationAction("tender-1", "gen-1");

      expect(result.error).toBe("Cette génération est introuvable.");
    });

    it("maps a 403 to a comprehensible French message (not the actor's own generation)", async () => {
      appApiFetchMock.mockRejectedValue(new FakeAppApiError(403, "GENERATION_NOT_OWNED_BY_ACTOR", "not owned"));

      const result = await rejectGenerationAction("tender-1", "gen-1");

      expect(result.error).toBe("Vous ne pouvez valider ou rejeter que les générations que vous avez lancées.");
    });
  });
});
