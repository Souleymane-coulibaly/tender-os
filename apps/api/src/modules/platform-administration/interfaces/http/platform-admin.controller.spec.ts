import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../../../identity";
import type { GetPlatformMetricsUseCase } from "../../application/use-cases/get-platform-metrics.use-case";
import type { GetPlatformOrganizationUseCase } from "../../application/use-cases/get-platform-organization.use-case";
import type { ListPlatformAuditLogsUseCase } from "../../application/use-cases/list-platform-audit-logs.use-case";
import type { ListPlatformDeadLetterEventsUseCase } from "../../application/use-cases/list-platform-dead-letter-events.use-case";
import type { ListPlatformOrganizationsUseCase } from "../../application/use-cases/list-platform-organizations.use-case";
import type { ListPlatformUsersUseCase } from "../../application/use-cases/list-platform-users.use-case";
import type { ReactivatePlatformOrganizationUseCase } from "../../application/use-cases/reactivate-platform-organization.use-case";
import type { SuspendPlatformOrganizationUseCase } from "../../application/use-cases/suspend-platform-organization.use-case";
import { PlatformRole } from "../../domain/platform-role";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import type { PlatformContext } from "./platform-access.guard";
import { PlatformAdminController } from "./platform-admin.controller";

const ORG_VIEW = {
  id: "org-1",
  name: "Acme Corp",
  slug: "acme-corp",
  defaultCurrency: "EUR",
  defaultTimezone: "Europe/Paris",
  status: "ACTIVE",
  settings: {},
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  activeMemberCount: 3,
};

const ACTOR: AuthenticatedActor = { userId: "admin-1", sessionId: "session-1" };
const PLATFORM_CONTEXT: PlatformContext = { administratorId: "pa-1", role: PlatformRole.Owner };
const REQUEST = { id: "request-1" } as unknown as RequestWithId;

function createController() {
  const listPlatformOrganizationsUseCase = {
    execute: vi.fn().mockResolvedValue({ items: [ORG_VIEW], nextCursor: null }),
  } as unknown as ListPlatformOrganizationsUseCase;
  const getPlatformOrganizationUseCase = {
    execute: vi.fn().mockResolvedValue(ORG_VIEW),
  } as unknown as GetPlatformOrganizationUseCase;
  const suspendPlatformOrganizationUseCase = {
    execute: vi.fn().mockResolvedValue({ ...ORG_VIEW, status: "SUSPENDED" }),
  } as unknown as SuspendPlatformOrganizationUseCase;
  const reactivatePlatformOrganizationUseCase = {
    execute: vi.fn().mockResolvedValue({ ...ORG_VIEW, status: "ACTIVE" }),
  } as unknown as ReactivatePlatformOrganizationUseCase;
  const listPlatformUsersUseCase = {
    execute: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  } as unknown as ListPlatformUsersUseCase;
  const listPlatformAuditLogsUseCase = {
    execute: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  } as unknown as ListPlatformAuditLogsUseCase;
  const getPlatformMetricsUseCase = {
    execute: vi.fn().mockResolvedValue({ organizationsByStatus: {}, usersByStatus: {}, platformAdministratorsByRole: {} }),
  } as unknown as GetPlatformMetricsUseCase;
  const listPlatformDeadLetterEventsUseCase = {
    execute: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  } as unknown as ListPlatformDeadLetterEventsUseCase;

  const controller = new PlatformAdminController(
    listPlatformOrganizationsUseCase,
    getPlatformOrganizationUseCase,
    suspendPlatformOrganizationUseCase,
    reactivatePlatformOrganizationUseCase,
    listPlatformUsersUseCase,
    listPlatformAuditLogsUseCase,
    getPlatformMetricsUseCase,
    listPlatformDeadLetterEventsUseCase,
  );

  return {
    controller,
    listPlatformOrganizationsUseCase,
    getPlatformOrganizationUseCase,
    suspendPlatformOrganizationUseCase,
    reactivatePlatformOrganizationUseCase,
    listPlatformUsersUseCase,
    listPlatformDeadLetterEventsUseCase,
  };
}

describe("PlatformAdminController", () => {
  it("listOrganizations strips fields not authorized for the platform back-office", async () => {
    const { controller } = createController();

    const result = await controller.listOrganizations(PLATFORM_CONTEXT, { limit: 25 });

    expect(result.items[0]).toEqual({
      id: "org-1",
      name: "Acme Corp",
      slug: "acme-corp",
      status: "ACTIVE",
      activeMemberCount: 3,
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    });
    expect(result.items[0]).not.toHaveProperty("settings");
    expect(result.items[0]).not.toHaveProperty("defaultCurrency");
  });

  it("getOrganization delegates with the resolved platform role", async () => {
    const { controller, getPlatformOrganizationUseCase } = createController();

    await controller.getOrganization(PLATFORM_CONTEXT, "org-1");

    expect(getPlatformOrganizationUseCase.execute).toHaveBeenCalledWith({
      actorRole: PlatformRole.Owner,
      organizationId: "org-1",
    });
  });

  it("suspendOrganization delegates with the actor, the reason and the request id", async () => {
    const { controller, suspendPlatformOrganizationUseCase } = createController();

    const result = await controller.suspendOrganization(
      ACTOR,
      PLATFORM_CONTEXT,
      "org-1",
      { reason: "Payment dispute" },
      REQUEST,
    );

    expect(suspendPlatformOrganizationUseCase.execute).toHaveBeenCalledWith({
      actorId: "admin-1",
      actorRole: PlatformRole.Owner,
      organizationId: "org-1",
      reason: "Payment dispute",
      requestId: "request-1",
    });
    expect(result.status).toBe("SUSPENDED");
  });

  it("reactivateOrganization delegates with the actor and the request id", async () => {
    const { controller, reactivatePlatformOrganizationUseCase } = createController();

    const result = await controller.reactivateOrganization(ACTOR, PLATFORM_CONTEXT, "org-1", REQUEST);

    expect(reactivatePlatformOrganizationUseCase.execute).toHaveBeenCalledWith({
      actorId: "admin-1",
      actorRole: PlatformRole.Owner,
      organizationId: "org-1",
      requestId: "request-1",
    });
    expect(result.status).toBe("ACTIVE");
  });

  it("listUsers delegates with the status filter", async () => {
    const { controller, listPlatformUsersUseCase } = createController();

    await controller.listUsers(PLATFORM_CONTEXT, { limit: 25, status: "SUSPENDED" });

    expect(listPlatformUsersUseCase.execute).toHaveBeenCalledWith({
      actorRole: PlatformRole.Owner,
      cursor: undefined,
      limit: 25,
      status: "SUSPENDED",
    });
  });

  it("listDeadLetterEvents delegates with the resolved platform role and optional organizationId filter", async () => {
    const { controller, listPlatformDeadLetterEventsUseCase } = createController();

    await controller.listDeadLetterEvents(PLATFORM_CONTEXT, { limit: 25, organizationId: "org-1" });

    expect(listPlatformDeadLetterEventsUseCase.execute).toHaveBeenCalledWith({
      actorRole: PlatformRole.Owner,
      cursor: undefined,
      limit: 25,
      organizationId: "org-1",
    });
  });
});
