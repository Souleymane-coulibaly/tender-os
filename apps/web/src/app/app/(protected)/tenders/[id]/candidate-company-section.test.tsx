import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CandidateCompanySummary } from "../../../../../lib/candidate-company-types";
import { CandidateCompanySection } from "./candidate-company-section";

const changeTenderCandidateCompanyAction = vi.fn(async (_tenderId: string, _prevState: unknown, _formData: FormData) => ({}) as { error?: string });

vi.mock("../../../actions", () => ({
  changeTenderCandidateCompanyAction: (tenderId: string, prevState: unknown, formData: FormData) => changeTenderCandidateCompanyAction(tenderId, prevState, formData),
}));

const alpha: CandidateCompanySummary = {
  id: "candidate-alpha",
  organizationId: "org-1",
  name: "Candidate Alpha",
  legalName: "Candidate Alpha SAS",
  status: "ACTIVE",
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const beta: CandidateCompanySummary = {
  id: "candidate-beta",
  organizationId: "org-1",
  name: "Candidate Beta",
  status: "ACTIVE",
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/**
 * Checkpoint 2.1-A5 (correctif audit — réserve P2 "couverture frontend insuffisante") — preuve
 * frontend que le Tender distingue bien CLIENT et ENTREPRISE CANDIDATE (mission §11/§52/§57),
 * jamais démontrée par un test avant ce correctif.
 */
describe("CandidateCompanySection", () => {
  it("BLOQUANT (mission §52) — displays the CURRENT CandidateCompany's own display name, never a Client's name", () => {
    render(<CandidateCompanySection tenderId="tender-1" status="DRAFT" resolution={{ kind: "loaded", company: alpha }} availableCandidateCompanies={[alpha, beta]} canChange={false} />);

    expect(screen.getByText("Entreprise candidate")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Candidate Alpha SAS" })).toHaveAttribute("href", "/app/candidate-companies/candidate-alpha");
  });

  it("BLOQUANT (mission §17/§57) — a legacy/unselected Tender shows the REQUIRED state, never crashes, never silently substitutes another value", () => {
    render(<CandidateCompanySection tenderId="tender-1" status="DRAFT" resolution={{ kind: "none" }} availableCandidateCompanies={[alpha, beta]} canChange={false} />);

    expect(screen.getByText("Entreprise candidate requise")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("offers a selection CTA when unselected, canChange, and candidates exist — and submitting calls the dedicated candidate-company action bound to this tender", async () => {
    const user = userEvent.setup();
    render(<CandidateCompanySection tenderId="tender-1" status="DRAFT" resolution={{ kind: "none" }} availableCandidateCompanies={[alpha, beta]} canChange={true} />);

    await user.click(screen.getByRole("button", { name: "Sélectionner une entreprise candidate" }));
    await user.selectOptions(screen.getByLabelText("Sélectionner l'entreprise candidate"), "candidate-alpha");
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(changeTenderCandidateCompanyAction).toHaveBeenCalledWith("tender-1", {}, expect.any(FormData));
  });

  it("offers a 'create' link instead of a selector when unselected, canChange, but NO CandidateCompany exists yet in the organization", () => {
    render(<CandidateCompanySection tenderId="tender-1" status="DRAFT" resolution={{ kind: "none" }} availableCandidateCompanies={[]} canChange={true} />);

    expect(screen.getByRole("link", { name: "Créer une entreprise candidate" })).toHaveAttribute("href", "/app/candidate-companies/new");
  });

  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.1 — ferme P2-CANDIDATE-FETCH-ERROR. Un echec de LECTURE ne doit
   * jamais se presenter comme une absence d'attribution : le Tender en porte bien une, et proposer
   * d'en choisir une autre inviterait a l'ecraser a cause d'une panne passagere.
   */
  it("BLOQUANT (CCV2-G.1) — a candidate that cannot be LOADED is never presented as 'required', and offers no selection control", () => {
    render(
      <CandidateCompanySection
        tenderId="tender-1"
        status="DRAFT"
        resolution={{ kind: "unavailable", candidateCompanyId: "candidate-alpha" }}
        availableCandidateCompanies={[alpha, beta]}
        canChange={true}
      />,
    );

    expect(screen.getByText(/momentanément indisponible/)).toBeInTheDocument();
    expect(screen.queryByText("Entreprise candidate requise")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sélectionner une entreprise candidate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Changer d'entreprise candidate" })).not.toBeInTheDocument();
  });

  it("never offers a change control when canChange is false, even with a candidate already selected and others available", () => {
    render(<CandidateCompanySection tenderId="tender-1" status="DRAFT" resolution={{ kind: "loaded", company: alpha }} availableCandidateCompanies={[alpha, beta]} canChange={false} />);

    expect(screen.queryByRole("button", { name: "Changer d'entreprise candidate" })).not.toBeInTheDocument();
  });

  it("never offers a change control once the Tender status is past the allowed window (mirrors CANDIDATE_CHANGE_ALLOWED_STATUSES), even with canChange true", () => {
    render(<CandidateCompanySection tenderId="tender-1" status="SUBMITTED" resolution={{ kind: "loaded", company: alpha }} availableCandidateCompanies={[alpha, beta]} canChange={true} />);

    expect(screen.queryByRole("button", { name: "Changer d'entreprise candidate" })).not.toBeInTheDocument();
  });
});
