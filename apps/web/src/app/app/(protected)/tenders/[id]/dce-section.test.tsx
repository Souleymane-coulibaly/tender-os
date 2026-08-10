import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DceSection } from "./dce-section";
import type { DceDocumentSummary, DceSummary } from "../../../../../lib/dce-types";

const initDceAction = vi.fn(async (_tenderId: string) => ({}));
const importDceFilesAction = vi.fn(async (_tenderId: string, _prevState: unknown, _formData: FormData) => ({}));
const startDceZipImportAction = vi.fn(async (_tenderId: string, _formData: FormData) => ({}) as { error?: string; job?: unknown });
const getDceImportJobAction = vi.fn(async (_tenderId: string, _jobId: string) => ({}) as { error?: string; job?: unknown });
const deleteDceDocumentAction = vi.fn(async (_tenderId: string, _documentId: string) => ({}));
const fetchDceSectionData = vi.fn(
  async (_tenderId: string): Promise<{ dce: DceSummary | null; documents: DceDocumentSummary[] }> => ({ dce: null, documents: [] }),
);

vi.mock("../../../dce-actions", () => ({
  initDceAction: (tenderId: string) => initDceAction(tenderId),
  importDceFilesAction: (tenderId: string, prevState: unknown, formData: FormData) =>
    importDceFilesAction(tenderId, prevState, formData),
  startDceZipImportAction: (tenderId: string, formData: FormData) => startDceZipImportAction(tenderId, formData),
  getDceImportJobAction: (tenderId: string, jobId: string) => getDceImportJobAction(tenderId, jobId),
  deleteDceDocumentAction: (tenderId: string, documentId: string) => deleteDceDocumentAction(tenderId, documentId),
  fetchDceSectionData: (tenderId: string) => fetchDceSectionData(tenderId),
}));

const startDocumentAnalysisAction = vi.fn(async (_tenderId: string, _documentId: string) => ({}));
const retryDocumentAnalysisAction = vi.fn(async (_analysisId: string) => ({}));
const getAnalysisJobAction = vi.fn(async (_analysisId: string) => ({}));

vi.mock("../../../analysis-actions", () => ({
  startDocumentAnalysisAction: (tenderId: string, documentId: string) => startDocumentAnalysisAction(tenderId, documentId),
  retryDocumentAnalysisAction: (analysisId: string) => retryDocumentAnalysisAction(analysisId),
  getAnalysisJobAction: (analysisId: string) => getAnalysisJobAction(analysisId),
}));

const dce: DceSummary = {
  id: "dce-1",
  organizationId: "org-1",
  tenderId: "tender-1",
  status: "IMPORTED",
  createdByUserId: "user-1",
  createdAt: "",
  updatedAt: "",
};

const documents: DceDocumentSummary[] = [
  {
    dceId: "dce-1",
    documentId: "document-1",
    originalFilename: "cctp.pdf",
    sanitizedFilename: "cctp.pdf",
    mimeType: "application/pdf",
    extension: "pdf",
    sizeBytes: 2048,
    checksum: "hash-1",
    currentVersionId: "document-1-version-1",
    currentVersionNumber: 1,
    category: "TECHNICAL",
    processingStatus: "READY_FOR_ANALYSIS",
    createdByUserId: "user-1",
    createdAt: "",
  },
];

describe("DceSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an initialization action when no DCE exists yet", () => {
    render(<DceSection tenderId="tender-1" dce={null} documents={[]} canManage={true} canDelete={true} canAnalyze={true} />);

    expect(screen.getByText(/Aucun DCE initialise/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Initialiser le DCE" })).toBeInTheDocument();
  });

  it("calls initDceAction when the initialization button is clicked", async () => {
    const user = userEvent.setup();
    render(<DceSection tenderId="tender-1" dce={null} documents={[]} canManage={true} canDelete={true} canAnalyze={true} />);

    await user.click(screen.getByRole("button", { name: "Initialiser le DCE" }));

    expect(initDceAction).toHaveBeenCalledWith("tender-1");
  });

  // Mission Sprint 8A.2 (audit Cockpit Bid Manager, découvert via le parcours Playwright du
  // Cockpit) — régression : `initDceAction` ne fait que `revalidatePath` côté serveur (cache pour
  // la PROCHAINE navigation, jamais un rafraîchissement de l'état client déjà monté) ; sans
  // rafraîchir explicitement `liveDce` au succès, l'écran restait bloqué sur "Aucun DCE
  // initialisé" bien que le DCE existe déjà réellement en base.
  it("refreshes the section after a successful initialization, never staying stuck on the empty state", async () => {
    fetchDceSectionData.mockResolvedValueOnce({ dce, documents: [] });
    const user = userEvent.setup();
    render(<DceSection tenderId="tender-1" dce={null} documents={[]} canManage={true} canDelete={true} canAnalyze={true} />);

    await user.click(screen.getByRole("button", { name: "Initialiser le DCE" }));

    expect(fetchDceSectionData).toHaveBeenCalledWith("tender-1");
    expect(await screen.findByText("Aucun document du DCE.")).toBeInTheDocument();
    expect(screen.queryByText(/Aucun DCE initialise/)).not.toBeInTheDocument();
  });

  it("lists existing DCE documents once a DCE exists", () => {
    render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={true} canDelete={true} canAnalyze={true} />);

    expect(screen.getByText("cctp.pdf")).toBeInTheDocument();
  });

  it("shows an empty state when the DCE has no documents yet", () => {
    render(<DceSection tenderId="tender-1" dce={dce} documents={[]} canManage={true} canDelete={true} canAnalyze={true} />);

    expect(screen.getByText("Aucun document du DCE.")).toBeInTheDocument();
  });

  it("submits a multi-file import and calls importDceFilesAction", async () => {
    const user = userEvent.setup();
    render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={true} canDelete={true} canAnalyze={true} />);

    const file = new File(["%PDF-1.7"], "reglement.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[name="files"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await user.click(screen.getByRole("button", { name: "Importer" }));

    expect(importDceFilesAction).toHaveBeenCalledWith("tender-1", {}, expect.any(FormData));
  });

  it("mission Sprint 8A.2 (bug #3) — submits a zip import asynchronously and calls startDceZipImportAction", async () => {
    startDceZipImportAction.mockResolvedValue({
      job: { id: "job-1", status: "CREATED", originalFilename: "archive.zip", sizeBytes: 4 },
    });
    getDceImportJobAction.mockResolvedValue({
      job: { id: "job-1", status: "READY", originalFilename: "archive.zip", sizeBytes: 4, result: { accepted: [], rejected: [] } },
    });
    const user = userEvent.setup();
    render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={true} canDelete={true} canAnalyze={true} />);

    const archive = new File(["PK.."], "archive.zip", { type: "application/zip" });
    const fileInput = document.querySelector('input[name="archive"]') as HTMLInputElement;
    await user.upload(fileInput, archive);
    await user.click(screen.getByRole("button", { name: "Importer une archive ZIP" }));

    expect(startDceZipImportAction).toHaveBeenCalledWith("tender-1", expect.any(FormData));
    expect(await screen.findByText("En file d'attente")).toBeInTheDocument();
  });

  it("calls deleteDceDocumentAction when Supprimer is clicked", async () => {
    const user = userEvent.setup();
    render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={true} canDelete={true} canAnalyze={true} />);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(deleteDceDocumentAction).toHaveBeenCalledWith("tender-1", "document-1");
  });

  describe("Analyser button (mission Sprint 8A.2)", () => {
    it("enables Analyser once extraction is ready and calls startDocumentAnalysisAction", async () => {
      const user = userEvent.setup();
      render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={true} canDelete={true} canAnalyze={true} />);

      const button = screen.getByRole("button", { name: "Analyser" });
      expect(button).toBeEnabled();
      await user.click(button);

      expect(startDocumentAnalysisAction).toHaveBeenCalledWith("tender-1", "document-1");
    });

    it("disables Analyser while extraction is not yet ready", () => {
      const pendingDocuments: DceDocumentSummary[] = [{ ...documents[0]!, processingStatus: "PENDING_TEXT_INSPECTION" }];
      render(
        <DceSection tenderId="tender-1" dce={dce} documents={pendingDocuments} canManage={true} canDelete={true} canAnalyze={true} />,
      );

      expect(screen.getByText("Extraction en cours")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Analyser" })).toBeDisabled();
      expect(startDocumentAnalysisAction).not.toHaveBeenCalled();
    });

    it("hides the Analyser button entirely when canAnalyze is false", () => {
      render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={true} canDelete={true} canAnalyze={false} />);

      expect(screen.queryByRole("button", { name: "Analyser" })).not.toBeInTheDocument();
    });

    it("disables Analyser and shows the precise French reason when analysis capabilities report AI is not configured, even though extraction is ready", () => {
      render(
        <DceSection
          tenderId="tender-1"
          dce={dce}
          documents={documents}
          canManage={true}
          canDelete={true}
          canAnalyze={true}
          analysisCapability={{ taskType: "ANALYZE_DOCUMENT", ready: false, reasonCode: "AI_PROVIDER_NOT_CONFIGURED" }}
        />,
      );

      expect(screen.getByRole("button", { name: "Analyser" })).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent("La génération IA n'est pas configurée pour ce type de contenu.");
      expect(startDocumentAnalysisAction).not.toHaveBeenCalled();
    });
  });

  describe("read-only role", () => {
    it("hides import actions when canManage is false", () => {
      render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={false} canDelete={false} canAnalyze={false} />);

      expect(screen.getByText("cctp.pdf")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Importer" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Importer une archive ZIP" })).not.toBeInTheDocument();
    });

    it("hides the delete action when canDelete is false", () => {
      render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={true} canDelete={false} canAnalyze={false} />);

      expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
    });

    it("hides the initialization action when canManage is false and no DCE exists yet", () => {
      render(<DceSection tenderId="tender-1" dce={null} documents={[]} canManage={false} canDelete={false} canAnalyze={false} />);

      expect(screen.queryByRole("button", { name: "Initialiser le DCE" })).not.toBeInTheDocument();
    });

    it("never calls any mutation action when canManage/canDelete are false", () => {
      render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={false} canDelete={false} canAnalyze={false} />);

      expect(initDceAction).not.toHaveBeenCalled();
      expect(importDceFilesAction).not.toHaveBeenCalled();
      expect(startDceZipImportAction).not.toHaveBeenCalled();
      expect(deleteDceDocumentAction).not.toHaveBeenCalled();
    });
  });
});
