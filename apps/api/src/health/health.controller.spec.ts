import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { PrismaService } from "../shared-kernel/prisma.service";
import { HealthController } from "./health.controller";

function buildResponseMock(): Response {
  return { status: vi.fn().mockReturnThis() } as unknown as Response;
}

describe("HealthController", () => {
  it("liveness (/health) returns ok without touching the database", () => {
    const prisma: Pick<PrismaService, "currentClient"> = { currentClient: vi.fn() };
    const controller = new HealthController(prisma as PrismaService);

    expect(controller.check()).toEqual({ status: "ok", service: "tenderos-api" });
    expect(prisma.currentClient).not.toHaveBeenCalled();
  });

  it("liveness (/health/live) also never touches the database", () => {
    const prisma: Pick<PrismaService, "currentClient"> = { currentClient: vi.fn() };
    const controller = new HealthController(prisma as PrismaService);

    expect(controller.live()).toEqual({ status: "ok", service: "tenderos-api" });
    expect(prisma.currentClient).not.toHaveBeenCalled();
  });

  it("readiness (/health/ready) reports ready when the database query succeeds", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ "?column?": 1 }]);
    const prisma: Pick<PrismaService, "currentClient"> = { currentClient: vi.fn().mockReturnValue({ $queryRaw: queryRaw }) };
    const controller = new HealthController(prisma as PrismaService);
    const response = buildResponseMock();

    const result = await controller.ready(response);

    expect(result).toEqual({ status: "ready", service: "tenderos-api", checks: { database: "ok" } });
    expect(response.status).not.toHaveBeenCalled();
  });

  it("BLOQUANT (mission §55/§112) — readiness reports not_ready with 503 when the database is unreachable, never a crash", async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error("connection refused"));
    const prisma: Pick<PrismaService, "currentClient"> = { currentClient: vi.fn().mockReturnValue({ $queryRaw: queryRaw }) };
    const controller = new HealthController(prisma as PrismaService);
    const response = buildResponseMock();

    const result = await controller.ready(response);

    expect(result).toEqual({ status: "not_ready", service: "tenderos-api", checks: { database: "unreachable" } });
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
