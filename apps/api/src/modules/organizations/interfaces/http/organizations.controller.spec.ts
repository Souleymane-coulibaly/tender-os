import { describe, expect, it, vi } from "vitest";
import type { OrganizationSummary } from "../../application/dtos";
import type { GetOrganizationUseCase } from "../../application/use-cases/get-organization.use-case";
import type { UpdateOrganizationUseCase } from "../../application/use-cases/update-organization.use-case";
import { OrganizationsController } from "./organizations.controller";

const ORGANIZATION_SUMMARY: OrganizationSummary = {
  id: "org-1",
  name: "Acme Corp",
  slug: "acme-corp",
  defaultCurrency: "EUR",
  defaultTimezone: "Europe/Paris",
  status: "TRIAL",
  settings: {},
  createdAt: "2026-07-26T14:00:00.000Z",
  updatedAt: "2026-07-26T14:00:00.000Z",
};

function createController(overrides?: {
  getOrganizationUseCase?: Partial<GetOrganizationUseCase>;
  updateOrganizationUseCase?: Partial<UpdateOrganizationUseCase>;
}) {
  const getOrganizationUseCase = {
    execute: vi.fn().mockResolvedValue(ORGANIZATION_SUMMARY),
    ...overrides?.getOrganizationUseCase,
  } as unknown as GetOrganizationUseCase;

  const updateOrganizationUseCase = {
    execute: vi.fn().mockResolvedValue(ORGANIZATION_SUMMARY),
    ...overrides?.updateOrganizationUseCase,
  } as unknown as UpdateOrganizationUseCase;

  const controller = new OrganizationsController(getOrganizationUseCase, updateOrganizationUseCase);

  return { controller, getOrganizationUseCase, updateOrganizationUseCase };
}

describe("OrganizationsController", () => {
  it("get delegates to GetOrganizationUseCase", async () => {
    const { controller, getOrganizationUseCase } = createController();

    const result = await controller.get("org-1");

    expect(getOrganizationUseCase.execute).toHaveBeenCalledWith({ id: "org-1" });
    expect(result).toEqual(ORGANIZATION_SUMMARY);
  });

  it("update delegates to UpdateOrganizationUseCase with the id and body merged", async () => {
    const { controller, updateOrganizationUseCase } = createController();

    await controller.update("org-1", { name: "Renamed" });

    expect(updateOrganizationUseCase.execute).toHaveBeenCalledWith({ id: "org-1", name: "Renamed" });
  });
});
