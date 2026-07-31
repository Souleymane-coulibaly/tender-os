import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddPricingSnapshotForm, AiModelStatusToggle } from "./ai-model-actions";
import type { AiModelSummary } from "../../../../../../lib/ai-configuration-types";

const enableAiModelAction = vi.fn(async (_modelId: string) => ({}));
const disableAiModelAction = vi.fn(async (_modelId: string) => ({}));
const addPricingSnapshotAction = vi.fn(async (_modelId: string, _prevState: unknown, _formData: FormData) => ({}));

vi.mock("../../../../ai-configuration-actions", () => ({
  enableAiModelAction: (modelId: string) => enableAiModelAction(modelId),
  disableAiModelAction: (modelId: string) => disableAiModelAction(modelId),
  addPricingSnapshotAction: (modelId: string, prevState: unknown, formData: FormData) =>
    addPricingSnapshotAction(modelId, prevState, formData),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const enabledModel = { id: "model-1", status: "ENABLED" } as AiModelSummary;
const disabledModel = { id: "model-1", status: "DISABLED" } as AiModelSummary;

describe("AiModelStatusToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Désactiver for an enabled model and calls disableAiModelAction on click", async () => {
    const user = userEvent.setup();
    render(<AiModelStatusToggle model={enabledModel} />);

    await user.click(screen.getByRole("button", { name: "Désactiver" }));
    expect(disableAiModelAction).toHaveBeenCalledWith("model-1");
  });

  it("shows Activer for a disabled model and calls enableAiModelAction on click", async () => {
    const user = userEvent.setup();
    render(<AiModelStatusToggle model={disabledModel} />);

    await user.click(screen.getByRole("button", { name: "Activer" }));
    expect(enableAiModelAction).toHaveBeenCalledWith("model-1");
  });
});

describe("AddPricingSnapshotForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits the pricing fields bound to the model id", async () => {
    const user = userEvent.setup();
    render(<AddPricingSnapshotForm modelId="model-1" />);

    await user.type(screen.getByLabelText(/Prix \/ M tokens entrée/), "5");
    await user.type(screen.getByLabelText(/Prix \/ M tokens sortie/), "15");
    await user.click(screen.getByRole("button", { name: "Ajouter un tarif" }));

    expect(addPricingSnapshotAction).toHaveBeenCalledWith("model-1", {}, expect.any(FormData));
  });
});
