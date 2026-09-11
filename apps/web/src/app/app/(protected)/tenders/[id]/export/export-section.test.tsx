import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExportSection } from "./export-section";
import type {
  ExportCapabilities,
  ExportJobSummary,
  ExportTemplateSummary,
} from "../../../../../../lib/export-types";
import type { GenerationSummary } from "../../../../../../lib/generation-types";
import type { PricingEstimateSummary } from "../../../../../../lib/pricing-types";

const READY_CAPABILITIES: ExportCapabilities = {
  canExport: true,
  canExportDocx: true,
  canExportPdf: true,
  canUseTemplate: true,
  blockers: [],
};

const previewExportAction = vi.fn(
  async (_tenderId: string, _templateId: string, _sections: unknown) => ({
    job: undefined as ExportJobSummary | undefined,
    error: undefined as string | undefined,
  }),
);

vi.mock("../../../../export-actions", () => ({
  previewExportAction: (tenderId: string, templateId: string, sections: unknown) =>
    previewExportAction(tenderId, templateId, sections),
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

function estimate(overrides: Partial<PricingEstimateSummary> = {}): PricingEstimateSummary {
  return {
    id: "estimate-1",
    organizationId: "org-1",
    type: "DETAILED",
    status: "CALCULATED",
    currentVersionNumber: 1,
    createdBy: "user-1",
    createdAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  } as PricingEstimateSummary;
}

function generation(overrides: Partial<GenerationSummary> = {}): GenerationSummary {
  return {
    id: "generation-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    taskType: "TECHNICAL_MEMO_SECTION",
    rootGenerationId: "generation-1",
    version: 1,
    status: "GENERATED",
    createdAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  } as GenerationSummary;
}

/** Les sources proposées par défaut : aucune — chaque test fournit celles qu'il éprouve. */
const NO_SOURCES = {
  generations: [] as GenerationSummary[],
  estimates: [] as PricingEstimateSummary[],
};

describe("ExportSection", () => {
  it("generates a preview by calling previewExportAction with the selected template and manual section content", async () => {
    previewExportAction.mockResolvedValueOnce({
      job: { id: "job-1", status: "COMPLETED", version: 1 } as ExportJobSummary,
      error: undefined,
    });
    const user = userEvent.setup();

    render(
      <ExportSection
        tenderId="tender-1"
        templates={[template()]}
        history={[]}
        actorRole="OWNER"
        capabilities={READY_CAPABILITIES}
        {...NO_SOURCES}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Contenu de la section"),
      "Notre approche méthodologique.",
    );
    await user.click(screen.getByRole("button", { name: "Générer l'aperçu" }));

    expect(previewExportAction).toHaveBeenCalledWith(
      "tender-1",
      "template-1",
      expect.arrayContaining([
        expect.objectContaining({
          sectionId: "INTRO",
          sourceType: "MANUAL",
          manualContent: "Notre approche méthodologique.",
        }),
      ]),
    );
    expect(await screen.findByText(/Télécharger/)).toBeInTheDocument();
  });

  it("displays the backend error returned by previewExportAction, never a silent failure", async () => {
    previewExportAction.mockResolvedValueOnce({
      job: undefined,
      error: "La sélection de sections est invalide.",
    });
    const user = userEvent.setup();

    render(
      <ExportSection
        tenderId="tender-1"
        templates={[template()]}
        history={[]}
        actorRole="OWNER"
        capabilities={READY_CAPABILITIES}
        {...NO_SOURCES}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Générer l'aperçu" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La sélection de sections est invalide.",
    );
  });

  it("sends pricingEstimateId and pricingEstimateVersionNumber (never a version id passed as an estimate id) for a PRICING section", async () => {
    previewExportAction.mockResolvedValueOnce({
      job: { id: "job-1", status: "COMPLETED", version: 1 } as ExportJobSummary,
      error: undefined,
    });
    const user = userEvent.setup();

    render(
      <ExportSection
        tenderId="tender-1"
        templates={[template()]}
        history={[]}
        actorRole="OWNER"
        capabilities={READY_CAPABILITIES}
        generations={[]}
        estimates={[estimate({ id: "estimate-42", currentVersionNumber: 3 })]}
      />,
    );
    await user.selectOptions(screen.getByDisplayValue("Contenu manuel"), "PRICING");

    // L'estimation se CHOISIT dans une liste lisible — plus aucun identifiant à recopier à la main.
    const select = screen.getByRole("combobox", { name: "Estimation à reprendre" });
    expect(
      within(select).getByRole("option", { name: /Estimation v3 · Calculée/ }),
    ).toBeInTheDocument();
    await user.selectOptions(select, "estimate-42");
    await user.type(screen.getByPlaceholderText("N° de version (vide = courante)"), "3");
    await user.click(screen.getByRole("button", { name: "Générer l'aperçu" }));

    expect(previewExportAction).toHaveBeenCalledWith(
      "tender-1",
      "template-1",
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "PRICING",
          pricingEstimateId: "estimate-42",
          pricingEstimateVersionNumber: 3,
        }),
      ]),
    );
  });

  it("propose les générations de l'appel d'offres par un libellé lisible, jamais par leur identifiant", async () => {
    previewExportAction.mockResolvedValueOnce({
      job: { id: "job-1", status: "COMPLETED", version: 1 } as ExportJobSummary,
      error: undefined,
    });
    const user = userEvent.setup();

    render(
      <ExportSection
        tenderId="tender-1"
        templates={[template()]}
        history={[]}
        actorRole="OWNER"
        capabilities={READY_CAPABILITIES}
        generations={[generation({ id: "generation-7", version: 2 })]}
        estimates={[]}
      />,
    );
    await user.selectOptions(screen.getByDisplayValue("Contenu manuel"), "GENERATION");

    const select = screen.getByRole("combobox", { name: "Génération à reprendre" });
    expect(within(select).getByRole("option", { name: /v2/ })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "generation-7" })).not.toBeInTheDocument();
    await user.selectOptions(select, "generation-7");
    await user.click(screen.getByRole("button", { name: "Générer l'aperçu" }));

    expect(previewExportAction).toHaveBeenCalledWith(
      "tender-1",
      "template-1",
      expect.arrayContaining([
        expect.objectContaining({ sourceType: "GENERATION", generationId: "generation-7" }),
      ]),
    );
  });

  it("dit clairement qu'aucune génération n'existe encore, au lieu d'une liste vide muette", async () => {
    const user = userEvent.setup();
    render(
      <ExportSection
        tenderId="tender-1"
        templates={[template()]}
        history={[]}
        actorRole="OWNER"
        capabilities={READY_CAPABILITIES}
        {...NO_SOURCES}
      />,
    );

    await user.selectOptions(screen.getByDisplayValue("Contenu manuel"), "GENERATION");
    expect(
      screen.getByRole("option", { name: "Aucune génération pour cet appel d'offres" }),
    ).toBeInTheDocument();
  });

  it("hides the preview form for a role that cannot manage exports", () => {
    render(
      <ExportSection
        tenderId="tender-1"
        templates={[template()]}
        history={[]}
        actorRole="READ_ONLY"
        capabilities={READY_CAPABILITIES}
        {...NO_SOURCES}
      />,
    );
    expect(screen.queryByRole("button", { name: "Générer l'aperçu" })).not.toBeInTheDocument();
  });

  it("shows the precise French blocker reason and never the form when capabilities report the export is not possible yet", () => {
    const blockedCapabilities: ExportCapabilities = {
      canExport: false,
      canExportDocx: false,
      canExportPdf: false,
      canUseTemplate: false,
      blockers: [{ code: "TEMPLATE_VERSION_MISSING" }],
    };
    render(
      <ExportSection
        tenderId="tender-1"
        templates={[template()]}
        history={[]}
        actorRole="OWNER"
        capabilities={blockedCapabilities}
        {...NO_SOURCES}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Aucune version de modèle d'export n'est active.",
    );
    expect(screen.queryByRole("button", { name: "Générer l'aperçu" })).not.toBeInTheDocument();
  });
});
