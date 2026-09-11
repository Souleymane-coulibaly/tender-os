import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationSection } from "./generation-section";
import type { GenerationSummary } from "../../../../../../lib/generation-types";

const launchGenerationAction = vi.fn(async (_tenderId: string, _taskType: string): Promise<{ error?: string; generationId?: string }> => ({
  generationId: "gen-2",
}));
const retryGenerationAction = vi.fn(async (_tenderId: string, _generationId: string) => ({}));
const regenerateGenerationAction = vi.fn(async (_tenderId: string, _generationId: string) => ({}));
const cancelGenerationAction = vi.fn(async (_tenderId: string, _generationId: string) => ({}));
const editGenerationAction = vi.fn(async (_tenderId: string, _generationId: string, _content: string) => ({}));
const validateGenerationAction = vi.fn(async (_tenderId: string, _generationId: string) => ({}));
const rejectGenerationAction = vi.fn(async (_tenderId: string, _generationId: string, _reason?: string) => ({}));

vi.mock("../../../../generation-actions", () => ({
  launchGenerationAction: (tenderId: string, taskType: string) => launchGenerationAction(tenderId, taskType),
  retryGenerationAction: (tenderId: string, generationId: string) => retryGenerationAction(tenderId, generationId),
  regenerateGenerationAction: (tenderId: string, generationId: string) => regenerateGenerationAction(tenderId, generationId),
  cancelGenerationAction: (tenderId: string, generationId: string) => cancelGenerationAction(tenderId, generationId),
  editGenerationAction: (tenderId: string, generationId: string, content: string) => editGenerationAction(tenderId, generationId, content),
  validateGenerationAction: (tenderId: string, generationId: string) => validateGenerationAction(tenderId, generationId),
  rejectGenerationAction: (tenderId: string, generationId: string, reason?: string) => rejectGenerationAction(tenderId, generationId, reason),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const TASK_TYPE_LABELS = { EXECUTIVE_SUMMARY: "Synthèse exécutive", METHODOLOGY: "Méthodologie" };

function generation(overrides: Partial<GenerationSummary> = {}): GenerationSummary {
  return {
    id: "gen-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    taskType: "EXECUTIVE_SUMMARY",
    rootGenerationId: "gen-1",
    version: 1,
    status: "GENERATED",
    promptTemplateId: "template-1",
    promptVersionId: "version-1",
    promptVersionNumber: 1,
    fallbackLevel: 0,
    generatedContent: "Contenu généré.",
    createdBy: "user-1",
    createdAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

/** Variante sans `generatedContent` — `exactOptionalPropertyTypes` interdit de le mettre à
 *  `undefined` explicitement via `generation({ generatedContent: undefined })`, la propriété doit
 *  être ABSENTE de l'objet, jamais présente avec la valeur `undefined`. */
function generationWithoutContent(overrides: Partial<Omit<GenerationSummary, "generatedContent">> = {}): GenerationSummary {
  const full = generation();
  const { generatedContent: _omitted, ...rest } = full;
  return { ...rest, ...overrides };
}

/**
 * Correctif Sprint 6 (audit Codex P2-4 — "tests frontend Sprint 6 insuffisants") — couvre le
 * composant principal d'affichage/pilotage des générations, sans aucun test avant ce correctif.
 */
describe("GenerationSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the launch form for a role allowed to manage generations and launches with the selected taskType", async () => {
    const user = userEvent.setup();
    render(<GenerationSection tenderId="tender-1" initialGenerations={[]} actorRole="OWNER" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />);

    await user.selectOptions(screen.getByLabelText("Type de contenu"), "METHODOLOGY");
    await user.click(screen.getByRole("button", { name: "Générer" }));

    expect(launchGenerationAction).toHaveBeenCalledWith("tender-1", "METHODOLOGY");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("correctif Sprint 6 (audit Codex P1-1) — shows the backend's error message when launch fails (e.g. no active routing policy), never a raw code", async () => {
    launchGenerationAction.mockResolvedValue({ error: "Cette action entre en conflit avec l'état actuel de la ressource." });
    const user = userEvent.setup();
    render(<GenerationSection tenderId="tender-1" initialGenerations={[]} actorRole="OWNER" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />);

    await user.click(screen.getByRole("button", { name: "Générer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Cette action entre en conflit avec l'état actuel de la ressource.");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("hides the launch form for a READ_ONLY actor (UI-only gate, backend remains the source of truth)", () => {
    render(<GenerationSection tenderId="tender-1" initialGenerations={[]} actorRole="READ_ONLY" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />);
    expect(screen.queryByRole("button", { name: "Générer" })).not.toBeInTheDocument();
  });

  it("shows a placeholder when there are no generations yet", () => {
    render(<GenerationSection tenderId="tender-1" initialGenerations={[]} actorRole="OWNER" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />);
    expect(screen.getByText("Aucune génération pour l'instant.")).toBeInTheDocument();
  });

  it("a GENERATED generation shows Régénérer/Éditer/Valider but never Réessayer or Annuler", () => {
    render(
      <GenerationSection tenderId="tender-1" initialGenerations={[generation()]} actorRole="OWNER" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />,
    );
    expect(screen.getByText("Contenu généré.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Régénérer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Éditer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Valider" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Annuler" })).not.toBeInTheDocument();
  });

  it("mission Sprint 8A.2 (bugs #4/#10) — a FAILED generation shows the mapped French message, never the raw English errorMessage", async () => {
    const user = userEvent.setup();
    render(
      <GenerationSection
        tenderId="tender-1"
        initialGenerations={[
          generationWithoutContent({
            status: "FAILED",
            errorCode: "NO_ACTIVE_ROUTING_POLICY",
            errorMessage: "No active routing policy for this task type; ask an administrator to activate one before generating.",
          }),
        ]}
        actorRole="OWNER"
        taskTypeLabels={TASK_TYPE_LABELS}
        capabilities={[]}
      />,
    );

    expect(
      screen.getByText(
        "Échec : La génération IA n'est pas configurée pour ce type de contenu. Contactez le support.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No active routing policy for this task type/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(retryGenerationAction).toHaveBeenCalledWith("tender-1", "gen-1");
  });

  describe("capabilities gating (mission Sprint 8A.2 bugs #1/#4)", () => {
    it("disables Générer and shows the reason when the selected task type isn't configured", () => {
      render(
        <GenerationSection
          tenderId="tender-1"
          initialGenerations={[]}
          actorRole="OWNER"
          taskTypeLabels={TASK_TYPE_LABELS}
          capabilities={[{ taskType: "EXECUTIVE_SUMMARY", ready: false, reasonCode: "NO_ACTIVE_ROUTING_POLICY" }]}
        />,
      );

      expect(screen.getByRole("button", { name: "Générer" })).toBeDisabled();
      expect(
        screen.getByText(
          "La génération IA n'est pas configurée pour ce type de contenu. Contactez le support.",
        ),
      ).toBeInTheDocument();
      expect(launchGenerationAction).not.toHaveBeenCalled();
    });

    it("enables Générer once the selected task type is ready", async () => {
      const user = userEvent.setup();
      render(
        <GenerationSection
          tenderId="tender-1"
          initialGenerations={[]}
          actorRole="OWNER"
          taskTypeLabels={TASK_TYPE_LABELS}
          capabilities={[{ taskType: "EXECUTIVE_SUMMARY", ready: true }]}
        />,
      );

      const button = screen.getByRole("button", { name: "Générer" });
      expect(button).toBeEnabled();
      await user.click(button);
      expect(launchGenerationAction).toHaveBeenCalledWith("tender-1", "EXECUTIVE_SUMMARY");
    });
  });

  it("a PENDING generation shows Annuler but never Réessayer/Régénérer/Valider", () => {
    render(
      <GenerationSection
        tenderId="tender-1"
        initialGenerations={[generationWithoutContent({ status: "PENDING" })]}
        actorRole="OWNER"
        taskTypeLabels={TASK_TYPE_LABELS}
        capabilities={[]}
      />,
    );
    expect(screen.getByRole("button", { name: "Annuler" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Régénérer" })).not.toBeInTheDocument();
  });

  it("hides all action buttons for a READ_ONLY actor even on a GENERATED generation", () => {
    render(
      <GenerationSection tenderId="tender-1" initialGenerations={[generation()]} actorRole="READ_ONLY" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />,
    );
    expect(screen.queryByRole("button", { name: "Régénérer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Éditer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Valider" })).not.toBeInTheDocument();
  });

  it("cost/tokens are shown only when the backend actually included them (server-computed authorization, never a frontend guess)", () => {
    const { rerender } = render(
      <GenerationSection tenderId="tender-1" initialGenerations={[generation()]} actorRole="OWNER" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />,
    );
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();

    rerender(
      <GenerationSection
        tenderId="tender-1"
        initialGenerations={[generation({ totalTokenCount: 42, estimatedCostAmount: "0.0012", currency: "USD" })]}
        actorRole="OWNER"
        taskTypeLabels={TASK_TYPE_LABELS}
        capabilities={[]}
      />,
    );
    expect(screen.getByText(/42 tokens/)).toBeInTheDocument();
    expect(screen.getByText(/0.0012 USD/)).toBeInTheDocument();
  });

  it("clicking Valider calls validateGenerationAction and refreshes", async () => {
    validateGenerationAction.mockResolvedValue({});
    const user = userEvent.setup();
    render(
      <GenerationSection tenderId="tender-1" initialGenerations={[generation()]} actorRole="OWNER" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />,
    );

    await user.click(screen.getByRole("button", { name: "Valider" }));

    expect(validateGenerationAction).toHaveBeenCalledWith("tender-1", "gen-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  /** Réaudit Codex P1 — "le rejet d'une génération est absent". */
  describe("reject", () => {
    it("a GENERATED, not-yet-reviewed generation shows a Rejeter button that reveals a reason field, then calls rejectGenerationAction", async () => {
      rejectGenerationAction.mockResolvedValue({});
      const user = userEvent.setup();
      render(
        <GenerationSection tenderId="tender-1" initialGenerations={[generation()]} actorRole="OWNER" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />,
      );

      await user.click(screen.getByRole("button", { name: "Rejeter" }));
      await user.type(screen.getByLabelText("Raison du rejet (optionnelle)"), "Ton trop informel");
      await user.click(screen.getByRole("button", { name: "Confirmer le rejet" }));

      expect(rejectGenerationAction).toHaveBeenCalledWith("tender-1", "gen-1", "Ton trop informel");
      expect(refreshMock).toHaveBeenCalled();
    });

    it("the rejection reason is optional — confirming with an empty field sends undefined, never an empty string", async () => {
      rejectGenerationAction.mockResolvedValue({});
      const user = userEvent.setup();
      render(
        <GenerationSection tenderId="tender-1" initialGenerations={[generation()]} actorRole="OWNER" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />,
      );

      await user.click(screen.getByRole("button", { name: "Rejeter" }));
      await user.click(screen.getByRole("button", { name: "Confirmer le rejet" }));

      expect(rejectGenerationAction).toHaveBeenCalledWith("tender-1", "gen-1", undefined);
    });

    it("cancelling the reject flow never calls the action", async () => {
      const user = userEvent.setup();
      render(
        <GenerationSection tenderId="tender-1" initialGenerations={[generation()]} actorRole="OWNER" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />,
      );

      await user.click(screen.getByRole("button", { name: "Rejeter" }));
      await user.click(screen.getByRole("button", { name: "Annuler" }));

      expect(screen.queryByLabelText("Raison du rejet (optionnelle)")).not.toBeInTheDocument();
      expect(rejectGenerationAction).not.toHaveBeenCalled();
    });

    it("réaudit Codex P1 — shows the backend's French error message when rejection fails (e.g. already validated), never a raw code", async () => {
      rejectGenerationAction.mockResolvedValue({ error: "Cette génération a déjà été validée et ne peut plus être rejetée." });
      const user = userEvent.setup();
      render(
        <GenerationSection tenderId="tender-1" initialGenerations={[generation()]} actorRole="OWNER" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />,
      );

      await user.click(screen.getByRole("button", { name: "Rejeter" }));
      await user.click(screen.getByRole("button", { name: "Confirmer le rejet" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Cette génération a déjà été validée et ne peut plus être rejetée.");
      expect(refreshMock).not.toHaveBeenCalled();
    });

    it("a REJECTED generation shows the rejection date/reason and hides both Valider and Rejeter", () => {
      render(
        <GenerationSection
          tenderId="tender-1"
          initialGenerations={[generation({ rejectedBy: "user-owner", rejectedAt: "2026-08-01T11:00:00.000Z", rejectionReason: "Hors sujet" })]}
          actorRole="OWNER"
          taskTypeLabels={TASK_TYPE_LABELS}
        capabilities={[]}
        />,
      );

      expect(screen.getByText(/Rejetée le/)).toBeInTheDocument();
      expect(screen.getByText(/Hors sujet/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Valider" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Rejeter" })).not.toBeInTheDocument();
    });

    it("a VALIDATED generation never shows a Rejeter button", () => {
      render(
        <GenerationSection
          tenderId="tender-1"
          initialGenerations={[generation({ validatedBy: "user-owner", validatedAt: "2026-08-01T11:00:00.000Z" })]}
          actorRole="OWNER"
          taskTypeLabels={TASK_TYPE_LABELS}
        capabilities={[]}
        />,
      );

      expect(screen.queryByRole("button", { name: "Rejeter" })).not.toBeInTheDocument();
    });

    it("a READ_ONLY actor never sees the Rejeter button", () => {
      render(
        <GenerationSection tenderId="tender-1" initialGenerations={[generation()]} actorRole="READ_ONLY" taskTypeLabels={TASK_TYPE_LABELS} capabilities={[]} />,
      );
      expect(screen.queryByRole("button", { name: "Rejeter" })).not.toBeInTheDocument();
    });
  });
});
