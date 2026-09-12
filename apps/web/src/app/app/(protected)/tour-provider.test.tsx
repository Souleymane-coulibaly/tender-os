import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TourStep } from "../../../lib/tour-steps";
import { TourProvider, useTour } from "./tour-provider";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../lib/analytics", () => ({ GA_EVENTS: {}, trackEvent: vi.fn() }));

let resolveStart: (() => void) | undefined;
const updateTourStateAction = vi.fn((action: string) =>
  action === "START" ? new Promise<{ error?: string }>((resolve) => (resolveStart = () => resolve({}))) : Promise.resolve({}),
);
vi.mock("../tour-actions", () => ({ updateTourStateAction: (action: string) => updateTourStateAction(action) }));

const STEPS: readonly TourStep[] = [
  { id: "dashboard", target: "dashboard", title: "Étape A", body: "A", href: "/app" },
  { id: "tenders", target: "tenders", title: "Étape B", body: "B", href: "/app/tenders" },
];

function Probe() {
  const tour = useTour();
  return (
    <div>
      <span data-testid="step">{tour.isTourActive ? tour.currentStepIndex : "inactive"}</span>
      <button type="button" onClick={() => void tour.startTour()}>start</button>
      <button type="button" onClick={() => void tour.next()}>next</button>
    </div>
  );
}

describe("TourProvider — démarrage", () => {
  beforeEach(() => {
    push.mockClear();
    updateTourStateAction.mockClear();
    window.sessionStorage.clear();
  });

  it("un enregistrement START lent ne ramène jamais à l'étape 1 un utilisateur qui a déjà avancé", async () => {
    render(
      <TourProvider steps={STEPS} hasEverInteractedWithTour>
        <Probe />
      </TourProvider>,
    );

    act(() => screen.getByRole("button", { name: "start" }).click());
    expect(screen.getByTestId("step")).toHaveTextContent("0");
    expect(push).toHaveBeenLastCalledWith("/app");

    // L'utilisateur avance pendant que START est encore en cours d'enregistrement.
    act(() => screen.getByRole("button", { name: "next" }).click());
    expect(screen.getByTestId("step")).toHaveTextContent("1");

    await act(async () => resolveStart?.());

    expect(screen.getByTestId("step")).toHaveTextContent("1");
    expect(push).toHaveBeenLastCalledWith("/app/tenders");
    expect(updateTourStateAction).toHaveBeenCalledWith("START");
  });
});
