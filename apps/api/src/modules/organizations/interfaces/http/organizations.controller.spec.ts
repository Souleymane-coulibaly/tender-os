import { describe, expect, it, vi } from "vitest";
import type { OrganizationSummary } from "../../application/dtos";
import type { CreateOrganizationUseCase } from "../../application/use-cases/create-organization.use-case";
import type { DeleteOrganizationUseCase } from "../../application/use-cases/delete-organization.use-case";
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
  createOrganizationUseCase?: Partial<CreateOrganizationUseCase>;
  getOrganizationUseCase?: Partial<GetOrganizationUseCase>;
  updateOrganizationUseCase?: Partial<UpdateOrganizationUseCase>;
  deleteOrganizationUseCase?: Partial<DeleteOrganizationUseCase>;
}) {
  const createOrganizationUseCase = {
    execute: vi.fn().mockResolvedValue(ORGANIZATION_SUMMARY),
    ...overrides?.createOrganizationUseCase,
  } as unknown as CreateOrganizationUseCase;

  const getOrganizationUseCase = {
    execute: vi.fn().mockResolvedValue(ORGANIZATION_SUMMARY),
    ...overrides?.getOrganizationUseCase,
  } as unknown as GetOrganizationUseCase;

  const updateOrganizationUseCase = {
    execute: vi.fn().mockResolvedValue(ORGANIZATION_SUMMARY),
    ...overrides?.updateOrganizationUseCase,
  } as unknown as UpdateOrganizationUseCase;

  const deleteOrganizationUseCase = {
    execute: vi.fn().mockResolvedValue(undefined),
    ...overrides?.deleteOrganizationUseCase,
  } as unknown as DeleteOrganizationUseCase;

  const controller = new OrganizationsController(
    createOrganizationUseCase,
    getOrganizationUseCase,
    updateOrganizationUseCase,
    deleteOrganizationUseCase,
  );

  return {
    controller,
    createOrganizationUseCase,
    getOrganizationUseCase,
    updateOrganizationUseCase,
    deleteOrganizationUseCase,
  };
}

function fakeResponse() {
  return { setHeader: vi.fn() } as unknown as import("express").Response;
}

describe("OrganizationsController", () => {
  it("create delegates to CreateOrganizationUseCase, sets Location and returns a bare object", async () => {
    const { controller, createOrganizationUseCase } = createController();
    const response = fakeResponse();

    const result = await controller.create(
      { name: "Acme Corp", slug: "acme-corp", defaultTimezone: "Europe/Paris" },
      response,
    );

    expect(createOrganizationUseCase.execute).toHaveBeenCalledWith({
      name: "Acme Corp",
      slug: "acme-corp",
      defaultTimezone: "Europe/Paris",
    });
    expect(response.setHeader).toHaveBeenCalledWith("Location", "/api/v1/organizations/org-1");
    expect(result).toEqual(ORGANIZATION_SUMMARY);
    expect(result).not.toHaveProperty("data");
  });

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

  it("remove delegates to DeleteOrganizationUseCase", async () => {
    const { controller, deleteOrganizationUseCase } = createController();

    await controller.remove("org-1");

    expect(deleteOrganizationUseCase.execute).toHaveBeenCalledWith({ id: "org-1" });
  });
});
