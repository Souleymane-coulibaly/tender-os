import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DceSection } from "./dce-section";
import type { DceDocumentSummary, DceSummary } from "../../../../../lib/dce-types";

const initDceAction = vi.fn(async (_tenderId: string) => ({}));
const importDceFilesAction = vi.fn(async (_tenderId: string, _prevState: unknown, _formData: FormData) => ({}));
const importDceZipAction = vi.fn(async (_tenderId: string, _prevState: unknown, _formData: FormData) => ({}));
const deleteDceDocumentAction = vi.fn(async (_tenderId: string, _documentId: string) => ({}));

vi.mock("../../../dce-actions", () => ({
  initDceAction: (tenderId: string) => initDceAction(tenderId),
  importDceFilesAction: (tenderId: string, prevState: unknown, formData: FormData) =>
    importDceFilesAction(tenderId, prevState, formData),
  importDceZipAction: (tenderId: string, prevState: unknown, formData: FormData) =>
    importDceZipAction(tenderId, prevState, formData),
  deleteDceDocumentAction: (tenderId: string, documentId: string) => deleteDceDocumentAction(tenderId, documentId),
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
    currentVersionNumber: 1,
    createdByUserId: "user-1",
    createdAt: "",
  },
];

describe("DceSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an initialization action when no DCE exists yet", () => {
    render(<DceSection tenderId="tender-1" dce={null} documents={[]} canManage={true} canDelete={true} />);

    expect(screen.getByText(/Aucun DCE initialise/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Initialiser le DCE" })).toBeInTheDocument();
  });

  it("calls initDceAction when the initialization button is clicked", async () => {
    const user = userEvent.setup();
    render(<DceSection tenderId="tender-1" dce={null} documents={[]} canManage={true} canDelete={true} />);

    await user.click(screen.getByRole("button", { name: "Initialiser le DCE" }));

    expect(initDceAction).toHaveBeenCalledWith("tender-1");
  });

  it("lists existing DCE documents once a DCE exists", () => {
    render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={true} canDelete={true} />);

    expect(screen.getByText("cctp.pdf")).toBeInTheDocument();
  });

  it("shows an empty state when the DCE has no documents yet", () => {
    render(<DceSection tenderId="tender-1" dce={dce} documents={[]} canManage={true} canDelete={true} />);

    expect(screen.getByText("Aucun document du DCE.")).toBeInTheDocument();
  });

  it("submits a multi-file import and calls importDceFilesAction", async () => {
    const user = userEvent.setup();
    render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={true} canDelete={true} />);

    const file = new File(["%PDF-1.7"], "reglement.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[name="files"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await user.click(screen.getByRole("button", { name: "Importer" }));

    expect(importDceFilesAction).toHaveBeenCalledWith("tender-1", {}, expect.any(FormData));
  });

  it("submits a zip import and calls importDceZipAction", async () => {
    const user = userEvent.setup();
    render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={true} canDelete={true} />);

    const archive = new File(["PK.."], "archive.zip", { type: "application/zip" });
    const fileInput = document.querySelector('input[name="archive"]') as HTMLInputElement;
    await user.upload(fileInput, archive);
    await user.click(screen.getByRole("button", { name: "Importer une archive ZIP" }));

    expect(importDceZipAction).toHaveBeenCalledWith("tender-1", {}, expect.any(FormData));
  });

  it("calls deleteDceDocumentAction when Supprimer is clicked", async () => {
    const user = userEvent.setup();
    render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={true} canDelete={true} />);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(deleteDceDocumentAction).toHaveBeenCalledWith("tender-1", "document-1");
  });

  describe("read-only role", () => {
    it("hides import actions when canManage is false", () => {
      render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={false} canDelete={false} />);

      expect(screen.getByText("cctp.pdf")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Importer" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Importer une archive ZIP" })).not.toBeInTheDocument();
    });

    it("hides the delete action when canDelete is false", () => {
      render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={true} canDelete={false} />);

      expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
    });

    it("hides the initialization action when canManage is false and no DCE exists yet", () => {
      render(<DceSection tenderId="tender-1" dce={null} documents={[]} canManage={false} canDelete={false} />);

      expect(screen.queryByRole("button", { name: "Initialiser le DCE" })).not.toBeInTheDocument();
    });

    it("never calls any mutation action when canManage/canDelete are false", () => {
      render(<DceSection tenderId="tender-1" dce={dce} documents={documents} canManage={false} canDelete={false} />);

      expect(initDceAction).not.toHaveBeenCalled();
      expect(importDceFilesAction).not.toHaveBeenCalled();
      expect(importDceZipAction).not.toHaveBeenCalled();
      expect(deleteDceDocumentAction).not.toHaveBeenCalled();
    });
  });
});
