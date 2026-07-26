import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SuspendReactivateButton } from "./suspend-reactivate-button";

vi.mock("../../../actions", () => ({
  suspendOrganizationAction: vi.fn(async (_organizationId: string, _prevState: unknown, _formData: FormData) => ({})),
  reactivateOrganizationAction: vi.fn(async (_organizationId: string) => ({})),
}));

describe("SuspendReactivateButton", () => {
  it("shows a Suspendre button for an ACTIVE organization, with a confirmation step", async () => {
    const user = userEvent.setup();
    render(<SuspendReactivateButton organizationId="org-1" status="ACTIVE" />);

    expect(screen.getByRole("button", { name: "Suspendre" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Suspendre" }));

    expect(screen.getByText(/perdront immédiatement l'accès/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmer la suspension" })).toBeInTheDocument();
  });

  it("shows a Réactiver button for a SUSPENDED organization, with a confirmation step", async () => {
    const user = userEvent.setup();
    render(<SuspendReactivateButton organizationId="org-1" status="SUSPENDED" />);

    expect(screen.getByRole("button", { name: "Réactiver" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Réactiver" }));

    expect(screen.getByRole("button", { name: "Confirmer la réactivation" })).toBeInTheDocument();
  });

  it("renders nothing for a CLOSED organization", () => {
    const { container } = render(<SuspendReactivateButton organizationId="org-1" status="CLOSED" />);

    expect(container).toBeEmptyDOMElement();
  });
});
