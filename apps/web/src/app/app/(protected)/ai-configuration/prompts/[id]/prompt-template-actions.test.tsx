import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchivePromptTemplateButton, CreatePromptVersionForm, PromptVersionActivateButton } from "./prompt-template-actions";

const createPromptVersionAction = vi.fn(async (_templateId: string, _prevState: unknown, _formData: FormData) => ({}));
const activatePromptVersionAction = vi.fn(async (_templateId: string, _versionId: string) => ({}));
const archivePromptTemplateAction = vi.fn(async (_templateId: string) => ({}));

vi.mock("../../../../generation-actions", () => ({
  createPromptVersionAction: (templateId: string, prevState: unknown, formData: FormData) =>
    createPromptVersionAction(templateId, prevState, formData),
  activatePromptVersionAction: (templateId: string, versionId: string) => activatePromptVersionAction(templateId, versionId),
  archivePromptTemplateAction: (templateId: string) => archivePromptTemplateAction(templateId),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

/**
 * Correctif Sprint 6 (audit Codex P2-4 — "tests frontend Sprint 6 insuffisants") — couvre les 3
 * composants admin de gestion des prompts (création de version, activation, archivage), aucun
 * n'ayant de test avant ce correctif.
 */
describe("CreatePromptVersionForm", () => {
  beforeEach(() => vi.clearAllMocks());

  // Correctif post-audit global (P1, 6 échecs Web) — diagnostiqué comme un vrai goulot CPU, jamais
  // un hang : c'est le seul test de ce fichier qui simule une frappe caractère par caractère sur
  // DEUX champs (`userEvent.type`, contre un simple clic pour les 2 autres describe blocks), avec
  // un temps de base déjà mesuré à 1000-2200ms même isolé. Reproduit isolément (4 exécutions) et en
  // suite complète (2 exécutions) sans jamais échouer — le timeout original observé par Codex
  // correspond à une contention CPU ponctuelle (61 fichiers en parallèle sur 12 coeurs logiques),
  // jamais une promesse non résolue, un mock incomplet ou une race condition dans le composant.
  // Timeout local (jamais global) porté à 15s en dernier recours, une fois la cause comprise.
  it(
    "submits systemPrompt/userPromptTemplate bound to the template id",
    async () => {
      const user = userEvent.setup();
      render(<CreatePromptVersionForm templateId="template-1" />);

      await user.type(screen.getByLabelText(/Prompt système/), "You are helpful.");
      await user.type(screen.getByLabelText(/Prompt utilisateur/), "Summarize {{tender.title}}");
      await user.click(screen.getByRole("button", { name: "Créer la version (brouillon)" }));

      expect(createPromptVersionAction).toHaveBeenCalledWith("template-1", {}, expect.any(FormData));
    },
    15_000,
  );
});

describe("PromptVersionActivateButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("activates the version bound to templateId/versionId and refreshes on success", async () => {
    activatePromptVersionAction.mockResolvedValue({});
    const user = userEvent.setup();
    render(<PromptVersionActivateButton templateId="template-1" versionId="version-1" />);

    await user.click(screen.getByRole("button", { name: "Activer" }));

    expect(activatePromptVersionAction).toHaveBeenCalledWith("template-1", "version-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("correctif Sprint 6 (audit Codex) — shows the conflict error and never refreshes when activation fails (e.g. PROMPT_VERSION_ACTIVATION_CONFLICT)", async () => {
    activatePromptVersionAction.mockResolvedValue({ error: "Une autre activation est déjà en cours ; réessayez." });
    const user = userEvent.setup();
    render(<PromptVersionActivateButton templateId="template-1" versionId="version-1" />);

    await user.click(screen.getByRole("button", { name: "Activer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Une autre activation est déjà en cours ; réessayez.");
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("ArchivePromptTemplateButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a confirmation click before actually archiving", async () => {
    archivePromptTemplateAction.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ArchivePromptTemplateButton templateId="template-1" />);

    await user.click(screen.getByRole("button", { name: "Archiver" }));
    expect(archivePromptTemplateAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirmer l'archivage" }));
    expect(archivePromptTemplateAction).toHaveBeenCalledWith("template-1");
  });

  it("cancelling the confirmation never calls the action", async () => {
    const user = userEvent.setup();
    render(<ArchivePromptTemplateButton templateId="template-1" />);

    await user.click(screen.getByRole("button", { name: "Archiver" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByRole("button", { name: "Confirmer l'archivage" })).not.toBeInTheDocument();
    expect(archivePromptTemplateAction).not.toHaveBeenCalled();
  });
});
