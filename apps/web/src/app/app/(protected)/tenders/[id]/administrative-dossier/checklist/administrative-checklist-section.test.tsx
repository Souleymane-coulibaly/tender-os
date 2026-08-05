import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdministrativeChecklistSection } from "./administrative-checklist-section";
import type {
  AdministrativeChecklist,
  AdministrativeDocumentTypeMetadata,
  AdministrativeDossierCapabilities,
  AdministrativeRequirementSummary,
} from "../../../../../../../lib/administrative-dossier-types";

const confirmAdministrativeRequirementAction = vi.fn(async (_tenderId: string, _requirementId: string) => ({}));
const rejectAdministrativeRequirementAction = vi.fn(async (_tenderId: string, _requirementId: string) => ({}));
const markAdministrativeRequirementNotApplicableAction = vi.fn(async (_tenderId: string, _requirementId: string) => ({}));
const createAdministrativeRequirementAction = vi.fn(async (_tenderId: string, _input: unknown) => ({}));
const createAdministrativeDocumentAction = vi.fn(async (_tenderId: string, _input: unknown) => ({}));
const attachAdministrativeDocumentRevisionAction = vi.fn(async (_tenderId: string, _documentId: string, _input: unknown) => ({}));
const getAdministrativeDocumentAction = vi.fn(async (_documentId: string) => ({}));
const validateAdministrativeDocumentAction = vi.fn(async (_tenderId: string, _documentId: string, _revisionId: string) => ({}));
const rejectAdministrativeDocumentAction = vi.fn(async (_tenderId: string, _documentId: string, _revisionId: string) => ({}));

vi.mock("../../../../../administrative-dossier-actions", () => ({
  confirmAdministrativeRequirementAction: (tenderId: string, requirementId: string) => confirmAdministrativeRequirementAction(tenderId, requirementId),
  rejectAdministrativeRequirementAction: (tenderId: string, requirementId: string) => rejectAdministrativeRequirementAction(tenderId, requirementId),
  markAdministrativeRequirementNotApplicableAction: (tenderId: string, requirementId: string) => markAdministrativeRequirementNotApplicableAction(tenderId, requirementId),
  createAdministrativeRequirementAction: (tenderId: string, input: unknown) => createAdministrativeRequirementAction(tenderId, input),
  createAdministrativeDocumentAction: (tenderId: string, input: unknown) => createAdministrativeDocumentAction(tenderId, input),
  attachAdministrativeDocumentRevisionAction: (tenderId: string, documentId: string, input: unknown) => attachAdministrativeDocumentRevisionAction(tenderId, documentId, input),
  getAdministrativeDocumentAction: (documentId: string) => getAdministrativeDocumentAction(documentId),
  validateAdministrativeDocumentAction: (tenderId: string, documentId: string, revisionId: string) => validateAdministrativeDocumentAction(tenderId, documentId, revisionId),
  rejectAdministrativeDocumentAction: (tenderId: string, documentId: string, revisionId: string) => rejectAdministrativeDocumentAction(tenderId, documentId, revisionId),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const DOCUMENT_TYPES: AdministrativeDocumentTypeMetadata[] = [
  { code: "DC1", label: "DC1 — Lettre de candidature", category: "CANDIDATURE", description: "", hasValidityPeriod: false, canRequireSignature: true },
  { code: "ATTESTATION_FISCALE", label: "Attestation de régularité fiscale", category: "FISCAL_SOCIAL", description: "", hasValidityPeriod: true, canRequireSignature: false },
];

function requirement(overrides: Partial<AdministrativeRequirementSummary> = {}): AdministrativeRequirementSummary {
  return {
    id: "req-1",
    tenderId: "tender-1",
    title: "Attestation fiscale",
    requirementType: "DOCUMENT",
    expectedDocumentType: "ATTESTATION_FISCALE",
    required: true,
    applicable: true,
    signatureRequired: false,
    origin: "MANUAL",
    createdBy: "user-1",
    validationStatus: "SUGGESTED",
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

function capabilities(overrides: Partial<AdministrativeDossierCapabilities> = {}): AdministrativeDossierCapabilities {
  return {
    canView: true,
    canEdit: true,
    canValidate: true,
    canGenerateDc1: true,
    canGenerateDc2: true,
    canGenerateDc4: true,
    canGenerateDume: true,
    canGenerateEngagementAct: true,
    signatureSummary: { required: 0, pending: 0, signed: 0 },
    blockers: [],
    warnings: [],
    ...overrides,
  };
}

const EMPTY_CHECKLIST: AdministrativeChecklist = { lines: [], completionPercentage: 0 };

describe("AdministrativeChecklistSection", () => {
  it("shows a SUGGESTED requirement with Confirmer/Rejeter/Non applicable actions when the actor can validate", async () => {
    const user = userEvent.setup();
    render(
      <AdministrativeChecklistSection
        tenderId="tender-1"
        checklist={EMPTY_CHECKLIST}
        requirements={[requirement()]}
        capabilities={capabilities()}
        availableDocuments={[]}
        documentTypes={DOCUMENT_TYPES}
      />,
    );

    expect(screen.getByText("Attestation fiscale")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));
    expect(confirmAdministrativeRequirementAction).toHaveBeenCalledWith("tender-1", "req-1");
  });

  it("hides validation actions and shows a waiting message when the actor cannot validate", () => {
    render(
      <AdministrativeChecklistSection
        tenderId="tender-1"
        checklist={EMPTY_CHECKLIST}
        requirements={[requirement()]}
        capabilities={capabilities({ canValidate: false })}
        availableDocuments={[]}
        documentTypes={DOCUMENT_TYPES}
      />,
    );

    expect(screen.queryByRole("button", { name: "Confirmer" })).not.toBeInTheDocument();
    expect(screen.getByText(/droits de validation requis/)).toBeInTheDocument();
  });

  it("hides the 'add a requirement' form when the actor cannot edit", () => {
    render(
      <AdministrativeChecklistSection
        tenderId="tender-1"
        checklist={EMPTY_CHECKLIST}
        requirements={[]}
        capabilities={capabilities({ canEdit: false })}
        availableDocuments={[]}
        documentTypes={DOCUMENT_TYPES}
      />,
    );

    expect(screen.queryByText("Ajouter une exigence")).not.toBeInTheDocument();
  });

  it("populates the document type select from the backend catalog — never a hardcoded list", () => {
    render(
      <AdministrativeChecklistSection
        tenderId="tender-1"
        checklist={EMPTY_CHECKLIST}
        requirements={[]}
        capabilities={capabilities()}
        availableDocuments={[]}
        documentTypes={DOCUMENT_TYPES}
      />,
    );

    expect(screen.getByRole("option", { name: "DC1 — Lettre de candidature" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Attestation de régularité fiscale" })).toBeInTheDocument();
  });

  it("requires a title before creating a requirement", async () => {
    const user = userEvent.setup();
    render(
      <AdministrativeChecklistSection
        tenderId="tender-1"
        checklist={EMPTY_CHECKLIST}
        requirements={[]}
        capabilities={capabilities()}
        availableDocuments={[]}
        documentTypes={DOCUMENT_TYPES}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(screen.getByText("Le titre est obligatoire.")).toBeInTheDocument();
    expect(createAdministrativeRequirementAction).not.toHaveBeenCalled();
  });

  it("renders checklist lines with their state label for confirmed requirements", () => {
    const confirmed = requirement({ id: "req-2", validationStatus: "CONFIRMED" });
    render(
      <AdministrativeChecklistSection
        tenderId="tender-1"
        checklist={{ lines: [{ requirementId: "req-2", title: confirmed.title, expectedDocumentType: confirmed.expectedDocumentType, required: true, applicable: true, state: "MANQUANT" }], completionPercentage: 0 }}
        requirements={[confirmed]}
        capabilities={capabilities()}
        availableDocuments={[]}
        documentTypes={DOCUMENT_TYPES}
      />,
    );

    expect(screen.getByText("Manquant")).toBeInTheDocument();
  });
});
