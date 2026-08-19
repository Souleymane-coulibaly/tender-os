import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CandidateCompanySummary } from "../../../../../lib/candidate-company-types";
import { OpportunityCandidateCompanySection } from "./candidate-company-section";

const updateOpportunityAction = vi.fn(async (_id: string, _input: Record<string, unknown>) => ({}) as { error?: string });

vi.mock("../../../opportunity-actions", () => ({
  updateOpportunityAction: (id: string, input: Record<string, unknown>) => updateOpportunityAction(id, input),
}));

const alpha: CandidateCompanySummary = {
  id: "candidate-alpha",
  organizationId: "org-1",
  name: "Candidate Alpha",
  status: "ACTIVE",
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/**
 * Checkpoint 2.1-A5 (correctif audit — réserve P2) — même discipline que
 * tenders/[id]/candidate-company-section.test.tsx, côté Opportunity : preuve que le parcours
 * "Opportunity sans Candidate" (mission §17) et la sélection (mission §18) fonctionnent réellement.
 */
describe("OpportunityCandidateCompanySection", () => {
  it("BLOQUANT (mission §17) — an Opportunity without a CandidateCompany shows 'Non sélectionnée', never a crash or a silent substitution", () => {
    render(<OpportunityCandidateCompanySection opportunityId="opp-1" currentCandidateCompany={null} availableCandidateCompanies={[alpha]} canManage={false} />);

    expect(screen.getByText("Entreprise candidate")).toBeInTheDocument();
    expect(screen.getByText("Non sélectionnée")).toBeInTheDocument();
  });

  it("displays the current CandidateCompany's display name as a link to its detail page", () => {
    render(<OpportunityCandidateCompanySection opportunityId="opp-1" currentCandidateCompany={alpha} availableCandidateCompanies={[alpha]} canManage={false} />);

    expect(screen.getByRole("link", { name: "Candidate Alpha" })).toHaveAttribute("href", "/app/candidate-companies/candidate-alpha");
  });

  it("selecting a candidate calls updateOpportunityAction with ONLY candidateCompanyId — never clobbering other opportunity fields", async () => {
    const user = userEvent.setup();
    render(<OpportunityCandidateCompanySection opportunityId="opp-1" currentCandidateCompany={null} availableCandidateCompanies={[alpha]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Sélectionner une entreprise candidate" }));
    await user.selectOptions(screen.getByRole("combobox"), "candidate-alpha");
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(updateOpportunityAction).toHaveBeenCalledWith("opp-1", { candidateCompanyId: "candidate-alpha" });
  });

  it("never offers a selection control when canManage is false", () => {
    render(<OpportunityCandidateCompanySection opportunityId="opp-1" currentCandidateCompany={null} availableCandidateCompanies={[alpha]} canManage={false} />);

    expect(screen.queryByRole("button", { name: "Sélectionner une entreprise candidate" })).not.toBeInTheDocument();
  });
});
