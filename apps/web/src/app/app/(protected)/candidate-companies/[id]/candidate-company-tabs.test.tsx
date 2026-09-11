import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resolveCandidateUiCapabilities } from "../../../../../lib/candidate-permissions";
import { CandidateCompanyTabs, type CandidateCompanyDossier } from "./candidate-company-tabs";

vi.mock("../../../candidate-capability-actions", () => ({
  createCandidateCapabilityAction: vi.fn(),
  archiveCandidateCapabilityAction: vi.fn(),
  attachCandidateDocumentAction: vi.fn(),
  detachCandidateDocumentAction: vi.fn(),
  createCandidateBankAccountAction: vi.fn(),
  archiveCandidateBankAccountAction: vi.fn(),
}));
vi.mock("./add-establishment-form", () => ({ AddEstablishmentForm: () => <div /> }));

const IBAN_SENTINEL = "••••••••••••••••••••••0189";

function buildDossier(overrides: Partial<CandidateCompanyDossier> = {}): CandidateCompanyDossier {
  return {
    company: {
      id: "cand-1",
      organizationId: "org-1",
      name: "ALPHA F SAS",
      legalName: "ALPHA F SAS",
      siren: "356000000",
      legalForm: "SAS",
      status: "ACTIVE",
      createdBy: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    establishments: [],
    representatives: [],
    certifications: [],
    insurances: [],
    references: [],
    humanResources: [],
    materialResources: [],
    documents: [],
    libraryDocuments: [],
    bankAccounts: [{ id: "bank-1", candidateCompanyId: "cand-1", accountHolder: "ALPHA F SAS", bankName: null, iban: IBAN_SENTINEL, bic: null, currency: null, isPrimary: true, status: "ACTIVE" }],
    ...overrides,
  };
}

/**
 * Checkpoint TENDEROS-2.1-CCV2-F — le rendu doit suivre EXACTEMENT la matrice `CandidatePermission`.
 * Le masquage n'est pas la sécurité (l'API refuse de toute façon) mais une action proposée puis
 * refusée en 403, ou une action légitime rendue introuvable, seraient l'une comme l'autre un défaut.
 */
describe("CCV2-F — fiche CandidateCompany pilotée par les permissions", () => {
  it("OWNER : l'onglet bancaire est présent", () => {
    render(<CandidateCompanyTabs dossier={buildDossier()} capabilities={resolveCandidateUiCapabilities("OWNER")} />);
    expect(screen.getByRole("button", { name: "Coordonnées bancaires" })).toBeTruthy();
  });

  it.each(["CONTRIBUTOR", "REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"])(
    "%s : l'onglet bancaire n'est PAS rendu, et aucun IBAN n'est envoyé au navigateur",
    (role) => {
      const { container } = render(<CandidateCompanyTabs dossier={buildDossier()} capabilities={resolveCandidateUiCapabilities(role)} />);
      expect(screen.queryByRole("button", { name: "Coordonnées bancaires" })).toBeNull();
      // Preuve la plus forte : la donnée sensible n'est pas dans le HTML du tout — elle n'est donc
      // ni masquée par CSS, ni affichée puis retirée après hydratation.
      expect(container.innerHTML).not.toContain(IBAN_SENTINEL);
      expect(container.innerHTML).not.toContain("ALPHA F SAS".repeat(0) + "bank-1");
    },
  );

  it("les onglets métier restent accessibles à tous les rôles en lecture", () => {
    render(<CandidateCompanyTabs dossier={buildDossier()} capabilities={resolveCandidateUiCapabilities("READ_ONLY")} />);
    for (const label of ["Vue d'ensemble", "Identité", "Établissements", "Représentants", "Certifications", "Documents de candidature"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("la vue d'ensemble compte les pièces expirées et bientôt expirées à partir du statut BACKEND", () => {
    const dossier = buildDossier({
      certifications: [{ id: "c1", candidateCompanyId: "cand-1", name: "ISO", issuer: null, number: null, scope: null, obtainedAt: null, expiresAt: null, status: "ACTIVE", temporalStatus: "EXPIRED" }],
      documents: [
        { documentId: "d1", candidateCompanyId: "cand-1", category: "KBIS", label: null, issuedAt: null, validFrom: null, validUntil: null, temporalStatus: "EXPIRING_SOON", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    render(<CandidateCompanyTabs dossier={dossier} capabilities={resolveCandidateUiCapabilities("OWNER")} />);
    expect(screen.getByText("1 expirée · 1 bientôt")).toBeTruthy();
  });
});
