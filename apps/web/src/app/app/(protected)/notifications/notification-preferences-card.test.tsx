import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotificationPreferencesCard } from "./notification-preferences-card";
import type { NotificationCategoryId, NotificationPreferenceSummary } from "../../../../lib/notification-types";

const updateNotificationPreferenceAction = vi.fn(async (_category: NotificationCategoryId, _emailEnabled: boolean): Promise<{ error?: string }> => ({}));
vi.mock("../../notifications-actions", () => ({
  updateNotificationPreferenceAction: (category: NotificationCategoryId, emailEnabled: boolean) => updateNotificationPreferenceAction(category, emailEnabled),
}));

const ALL_ENABLED: NotificationPreferenceSummary[] = [
  { category: "MARKET_WATCH", emailEnabled: true },
  { category: "COLLABORATION", emailEnabled: true },
  { category: "BILLING", emailEnabled: true },
];

describe("NotificationPreferencesCard", () => {
  it("BLOQUANT — renders all 3 categories with in-app always-on messaging and an email toggle each", () => {
    render(<NotificationPreferencesCard initialPreferences={ALL_ENABLED} />);
    expect(screen.getByText("Veille")).toBeInTheDocument();
    expect(screen.getByText("Collaboration")).toBeInTheDocument();
    expect(screen.getByText("Compte & facturation")).toBeInTheDocument();
    expect(screen.getAllByText("Dans l'application : toujours actif")).toHaveLength(3);
    expect(screen.getAllByRole("switch")).toHaveLength(3);
  });

  it("BLOQUANT — toggling a category's email switch calls the backend with the real category and new value", async () => {
    const user = userEvent.setup();
    render(<NotificationPreferencesCard initialPreferences={ALL_ENABLED} />);

    const switches = screen.getAllByRole("switch");
    await user.click(switches[1]!); // Collaboration

    await waitFor(() => expect(updateNotificationPreferenceAction).toHaveBeenCalledWith("COLLABORATION", false));
  });

  it("reverts the toggle if the backend update fails (backend stays authoritative)", async () => {
    updateNotificationPreferenceAction.mockResolvedValueOnce({ error: "Une erreur est survenue." });
    const user = userEvent.setup();
    render(<NotificationPreferencesCard initialPreferences={ALL_ENABLED} />);

    const switches = screen.getAllByRole("switch") as HTMLInputElement[];
    await user.click(switches[0]!); // Veille

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(switches[0]!.checked).toBe(true);
  });
});
