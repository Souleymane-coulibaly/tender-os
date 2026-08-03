import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExportSection } from "./export-section";
import type { ExportCapabilities, ExportJobSummary, ExportTemplateSummary } from "../../../../../../lib/export-types";

const READY_CAPABILITIES: ExportCapabilities = { canExport: true, canExportDocx: true, canExportPdf: true, canUseTemplate: true, blockers: [] };

const previewExportAction = vi.fn(async (_tenderId: string, _templateId: string, _sections: unknown) => ({ job: undefined as ExportJobSummary | undefined, error: undefined as string | undefined }));

vi.mock("../../../../export-actions", () => ({
  previewExportAction: (tenderId: string, templateId: string, sections: unknown) => previewExportAction(tenderId, templateId, sections),
}));

function template(overrides: Partial<ExportTemplateSummary> = {}): ExportTemplateSummary {
  return {
    id: "template-1",
    organizationId: "org-1",
    documentType: "TECHNICAL_MEMO",
    name: "Mémoire standard",
    createdBy: "user-1",
    createdAt: "2026-08-01T10:00:00.000Z",
    activeVersion: {
      id: "version-1",
      exportTemplateId: "template-1",
      version: 1,
      status: "ACTIVE",
      format: "DOCX",
      config: { sections: [{ id: "INTRO", label: "Introduction", mandatory: true, order: 0 }] },
      createdBy: "user-1",
      createdAt: "2026-08-01T10:00:00.000Z",
    },
    ...overrides,
  };
}

describe("ExportSection", () => {
  it("generates a preview by calling previewExportAction with the selected template and manual section content", async () => {
    previewExportAction.mockResolvedValueOnce({ job: { id: "job-1", status: "COMPLETED", version: 1 } as ExportJobSummary, error: undefined });
    const user = userEvent.setup();

    render(<ExportSection tenderId="tender-1" templates={[template()]} history={[]} actorRole="OWNER" capabilities={READY_CAPABILITIES} />);

    await user.type(screen.getByPlaceholderText("Contenu de la section"), "Notre approche méthodologique.");
    await user.click(screen.getByRole("button", { name: "Générer l'aperçu" }));

    expect(previewExportAction).toHaveBeenCalledWith(
      "tender-1",
      "template-1",
      expect.arrayContaining([expect.objectContaining({ sectionId: "INTRO", sourceType: "MANUAL", manualContent: "Notre approche méthodologique." })]),
    );
    expect(await screen.findByText(/Télécharger/)).toBeInTheDocument();
  });

  it("displays the backend error returned by previewExportAction, never a silent failure", async () => {
    previewExportAction.mockResolvedValueOnce({ job: undefined, error: "La sélection de sections est invalide." });
    const user = userEvent.setup();

    render(<ExportSection tenderId="tender-1" templates={[template()]} history={[]} actorRole="OWNER" capabilities={READY_CAPABILITIES} />);
    await user.click(screen.getByRole("button", { name: "Générer l'aperçu" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La sélection de sections est invalide.");
  });

  it("sends pricingEstimateId and pricingEstimateVersionNumber (never a version id passed as an estimate id) for a PRICING section", async () => {
    previewExportAction.mockResolvedValueOnce({ job: { id: "job-1", status: "COMPLETED", version: 1 } as ExportJobSummary, error: undefined });
    const user = userEvent.setup();

    render(<ExportSection tenderId="tender-1" templates={[template()]} history={[]} actorRole="OWNER" capabilities={READY_CAPABILITIES} />);
    await user.selectOptions(screen.getByDisplayValue("Contenu manuel"), "PRICING");
    await user.type(screen.getByPlaceholderText("ID de l'estimation"), "estimate-42");
    await user.type(screen.getByPlaceholderText("N° de version (vide = courante)"), "3");
    await user.click(screen.getByRole("button", { name: "Générer l'aperçu" }));

    expect(previewExportAction).toHaveBeenCalledWith(
      "tender-1",
      "template-1",
      expect.arrayContaining([expect.objectContaining({ sourceType: "PRICING", pricingEstimateId: "estimate-42", pricingEstimateVersionNumber: 3 })]),
    );
  });

  it("hides the preview form for a role that cannot manage exports", () => {
    render(<ExportSection tenderId="tender-1" templates={[template()]} history={[]} actorRole="READ_ONLY" capabilities={READY_CAPABILITIES} />);
    expect(screen.queryByRole("button", { name: "Générer l'aperçu" })).not.toBeInTheDocument();
  });

  it("shows the precise French blocker reason and never the form when capabilities report the export is not possible yet", () => {
    const blockedCapabilities: ExportCapabilities = { canExport: false, canExportDocx: false, canExportPdf: false, canUseTemplate: false, blockers: [{ code: "TEMPLATE_VERSION_MISSING" }] };
    render(<ExportSection tenderId="tender-1" templates={[template()]} history={[]} actorRole="OWNER" capabilities={blockedCapabilities} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Aucune version de modèle d'export n'est active.");
    expect(screen.queryByRole("button", { name: "Générer l'aperçu" })).not.toBeInTheDocument();
  });
});
