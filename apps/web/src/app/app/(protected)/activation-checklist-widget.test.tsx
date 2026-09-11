import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivationChecklistWidget } from "./activation-checklist-widget";

describe("ActivationChecklistWidget", () => {
  it("sends « Compléter l'entreprise candidate » to the candidate companies screen, never to the clients screen", () => {
    render(
      <ActivationChecklistWidget
        checklist={{
          completedCount: 1,
          totalCount: 2,
          items: [
            { id: "ACCOUNT_CREATED", label: "Compte créé", completed: true },
            { id: "CANDIDATE_COMPANY_COMPLETE", label: "Compléter l'entreprise candidate", completed: false },
          ],
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Compléter l'entreprise candidate" })).toHaveAttribute("href", "/app/candidate-companies");
  });

  it("a completed step is not a link", () => {
    render(
      <ActivationChecklistWidget
        checklist={{
          completedCount: 1,
          totalCount: 2,
          items: [
            { id: "CANDIDATE_COMPANY_COMPLETE", label: "Compléter l'entreprise candidate", completed: true },
            { id: "FIRST_DCE_IMPORTED", label: "Importer le premier DCE", completed: false },
          ],
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: "Compléter l'entreprise candidate" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Importer le premier DCE" })).toHaveAttribute("href", "/app/tenders/new");
  });
});
