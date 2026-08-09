import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OfficialFormsSection, type FormCardSpec } from "./official-forms-section";
import type { OfficialFormReadiness } from "../../../../../../lib/official-form-types";

type ActionResult = { error?: string; generated?: unknown };
const generateDc1Action = vi.fn(async (_tenderId: string): Promise<ActionResult> => ({}));
const generateDc2CandidateAction = vi.fn(async (_tenderId: string): Promise<ActionResult> => ({}));
const generateDc2MemberAction = vi.fn(async (_tenderId: string, _memberId: string): Promise<ActionResult> => ({}));
const generateDc4Action = vi.fn(async (_tenderId: string, _declarationId: string): Promise<ActionResult> => ({}));

vi.mock("../../../../official-form-actions", () => ({
  generateDc1Action: (tenderId: string) => generateDc1Action(tenderId),
  generateDc2CandidateAction: (tenderId: string) => generateDc2CandidateAction(tenderId),
  generateDc2MemberAction: (tenderId: string, memberId: string) => generateDc2MemberAction(tenderId, memberId),
  generateDc4Action: (tenderId: string, declarationId: string) => generateDc4Action(tenderId, declarationId),
}));

function readiness(overrides: Partial<OfficialFormReadiness> = {}): OfficialFormReadiness {
  return {
    documentType: "DC1",
    fields: [
      { fieldKey: "candidate.tradeName", label: "Nom commercial", status: "AVAILABLE", required: true, value: "ABC SAS", source: "CLIENT_PROFILE" },
      { fieldKey: "candidate.siret", label: "SIRET", status: "MISSING", required: true },
    ],
    applicableFieldCount: 2,
    availableFieldCount: 1,
    missingFieldKeys: ["candidate.siret"],
    needsReviewFieldKeys: [],
    readinessPercentage: 50,
    ...overrides,
  };
}

const download = (revisionId: string) => `/download/${revisionId}`;

describe("OfficialFormsSection", () => {
  it("shows an empty state when there is nothing to prepare yet", () => {
    render(<OfficialFormsSection cards={[]} />);
    expect(screen.getByText("Aucun formulaire officiel disponible pour l'instant.")).toBeInTheDocument();
  });

  it("renders multiple operator cards independently — DC1, DC2 candidate, DC2 member, DC4 — each with its own readiness %, never a single aggregated score", () => {
    const cards: FormCardSpec[] = [
      { key: "dc1", title: "DC1", operatorLabel: "Candidat", initialReadiness: readiness({ readinessPercentage: 90 }), canGenerate: true, action: "dc1", tenderId: "tender-1", downloadHref: download },
      { key: "dc2-candidate", title: "DC2", operatorLabel: "Candidat", initialReadiness: readiness({ readinessPercentage: 87, documentType: "DC2" }), canGenerate: true, action: "dc2-candidate", tenderId: "tender-1", downloadHref: download },
      {
        key: "dc2-member-a",
        title: "DC2",
        operatorLabel: "Entreprise Alpha",
        initialReadiness: readiness({ readinessPercentage: 25, documentType: "DC2" }),
        canGenerate: true,
        action: "dc2-member",
        tenderId: "tender-1",
        memberId: "member-A",
        downloadHref: download,
      },
      {
        key: "dc4-sub",
        title: "DC4",
        operatorLabel: "Sous-traitant DEF",
        initialReadiness: readiness({ readinessPercentage: 81, documentType: "DC4" }),
        canGenerate: true,
        action: "dc4",
        tenderId: "tender-1",
        subcontractorDeclarationId: "decl-1",
        downloadHref: download,
      },
    ];
    render(<OfficialFormsSection cards={cards} />);

    expect(screen.getByText("90% prêt")).toBeInTheDocument();
    expect(screen.getByText("87% prêt")).toBeInTheDocument();
    expect(screen.getByText("25% prêt")).toBeInTheDocument();
    expect(screen.getByText("81% prêt")).toBeInTheDocument();
    expect(screen.getByText(/Entreprise Alpha/)).toBeInTheDocument();
    expect(screen.getByText(/Sous-traitant DEF/)).toBeInTheDocument();
  });

  it("preview toggle shows the field table with per-field status, without ever generating a document", async () => {
    const user = userEvent.setup();
    const cards: FormCardSpec[] = [{ key: "dc1", title: "DC1", operatorLabel: "Candidat", initialReadiness: readiness(), canGenerate: true, action: "dc1", tenderId: "tender-1", downloadHref: download }];
    render(<OfficialFormsSection cards={cards} />);

    expect(screen.queryByText("Nom commercial")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Prévisualiser" }));
    expect(screen.getByText("Nom commercial")).toBeInTheDocument();
    expect(screen.getByText("ABC SAS")).toBeInTheDocument();
    expect(screen.getByText("Manquant")).toBeInTheDocument();
    expect(generateDc1Action).not.toHaveBeenCalled();
  });

  it("generating with missing required fields asks for confirmation ('Générer quand même ?') before calling the action — never auto-generates", async () => {
    const user = userEvent.setup();
    const cards: FormCardSpec[] = [{ key: "dc1", title: "DC1", operatorLabel: "Candidat", initialReadiness: readiness(), canGenerate: true, action: "dc1", tenderId: "tender-1", downloadHref: download }];
    render(<OfficialFormsSection cards={cards} />);

    await user.click(screen.getByRole("button", { name: "Générer le DOCX" }));
    expect(generateDc1Action).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Générer quand même");
    expect(screen.getByRole("button", { name: "Générer quand même" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Générer quand même" }));
    expect(generateDc1Action).toHaveBeenCalledWith("tender-1");
  });

  it("calls the DC2 member action (not the candidate action) when generating a groupement member's DC2 — economic operator stays explicit", async () => {
    const user = userEvent.setup();
    const cards: FormCardSpec[] = [
      {
        key: "dc2-member-a",
        title: "DC2",
        operatorLabel: "Entreprise Alpha",
        initialReadiness: readiness({ fields: [{ fieldKey: "candidate.tradeName", label: "Nom commercial", status: "AVAILABLE", required: true, value: "Entreprise Alpha" }], missingFieldKeys: [], readinessPercentage: 100, applicableFieldCount: 1, availableFieldCount: 1 }),
        canGenerate: true,
        action: "dc2-member",
        tenderId: "tender-1",
        memberId: "member-A",
        downloadHref: download,
      },
    ];
    render(<OfficialFormsSection cards={cards} />);

    await user.click(screen.getByRole("button", { name: "Générer le DOCX" }));
    expect(generateDc2MemberAction).toHaveBeenCalledWith("tender-1", "member-A");
    expect(generateDc2CandidateAction).not.toHaveBeenCalled();
    expect(generateDc4Action).not.toHaveBeenCalled();
  });

  it("shows a download link and history after a successful generation, and never claims legal validation", async () => {
    const user = userEvent.setup();
    generateDc4Action.mockResolvedValueOnce({
      generated: {
        id: "gen-1",
        tenderId: "tender-1",
        title: "DC4",
        createdAt: new Date().toISOString(),
        revisions: [{ id: "rev-1", revisionNumber: 1, status: "COMPLETED", artifactDocumentId: "doc-1", missingFields: [], createdAt: new Date().toISOString() }],
      },
    });
    const cards: FormCardSpec[] = [
      {
        key: "dc4-sub",
        title: "DC4",
        operatorLabel: "Sous-traitant DEF",
        initialReadiness: readiness({ missingFieldKeys: [], readinessPercentage: 100, applicableFieldCount: 1, availableFieldCount: 1, fields: [{ fieldKey: "subcontractor.tradeName", label: "Nom", status: "AVAILABLE", required: true, value: "DEF" }] }),
        canGenerate: true,
        action: "dc4",
        tenderId: "tender-1",
        subcontractorDeclarationId: "decl-1",
        downloadHref: download,
      },
    ];
    render(<OfficialFormsSection cards={cards} />);

    await user.click(screen.getByRole("button", { name: "Générer le DOCX" }));
    expect(generateDc4Action).toHaveBeenCalledWith("tender-1", "decl-1");

    await screen.findByRole("link", { name: "Télécharger le DOCX" });
    expect(screen.getByRole("link", { name: "Télécharger le DOCX" })).toHaveAttribute("href", "/download/rev-1");
    expect(screen.getByText(/validation humaine explicite reste nécessaire/)).toBeInTheDocument();
    expect(screen.queryByText(/juridiquement validé/i)).not.toBeInTheDocument();
  });

  it("shows an inline error and never a raw backend message when the action fails", async () => {
    const user = userEvent.setup();
    generateDc1Action.mockResolvedValueOnce({ error: "Vous n'avez pas les droits nécessaires pour cette action." });
    const cards: FormCardSpec[] = [
      {
        key: "dc1",
        title: "DC1",
        operatorLabel: "Candidat",
        initialReadiness: readiness({ missingFieldKeys: [], readinessPercentage: 100, applicableFieldCount: 1, availableFieldCount: 1, fields: [{ fieldKey: "candidate.tradeName", label: "Nom", status: "AVAILABLE", required: true, value: "ABC" }] }),
        canGenerate: true,
        action: "dc1",
        tenderId: "tender-1",
        downloadHref: download,
      },
    ];
    render(<OfficialFormsSection cards={cards} />);

    await user.click(screen.getByRole("button", { name: "Générer le DOCX" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Vous n'avez pas les droits nécessaires pour cette action.");
  });
});
