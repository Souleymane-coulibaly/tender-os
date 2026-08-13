import { UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma.service";
import { MetricsController } from "./metrics.controller";

function buildRequest(headers: Record<string, string> = {}): Request {
  return { header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

function buildResponse(): Response {
  return { setHeader: vi.fn() } as unknown as Response;
}

describe("MetricsController", () => {
  const originalToken = process.env.METRICS_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.METRICS_TOKEN = originalToken;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("exposes the declared metric names in Prometheus text exposition format (non-production, no token configured)", async () => {
    delete process.env.METRICS_TOKEN;
    process.env.NODE_ENV = "development";
    const prisma: Pick<PrismaService, "outboxEvent" | "deadLetterEvent"> = {
      outboxEvent: { count: vi.fn().mockResolvedValue(3) } as unknown as PrismaService["outboxEvent"],
      deadLetterEvent: { count: vi.fn().mockResolvedValue(1) } as unknown as PrismaService["deadLetterEvent"],
    };
    const controller = new MetricsController(prisma as PrismaService);

    const body = await controller.getMetrics(buildRequest(), buildResponse());

    expect(body).toContain("http_requests_total");
    expect(body).toContain("outbox_pending");
    expect(body).toContain("outbox_dead_letter");
    expect(body).toContain("ai_requests_total");
    expect(body).toContain("outbox_pending 3");
    expect(body).toContain("outbox_dead_letter 1");
  });

  it("BLOQUANT (réaudit externe) — refuses the request in production when METRICS_TOKEN is not configured, never an open-by-default endpoint", async () => {
    delete process.env.METRICS_TOKEN;
    process.env.NODE_ENV = "production";
    const prisma: Pick<PrismaService, "outboxEvent" | "deadLetterEvent"> = {
      outboxEvent: { count: vi.fn() } as unknown as PrismaService["outboxEvent"],
      deadLetterEvent: { count: vi.fn() } as unknown as PrismaService["deadLetterEvent"],
    };
    const controller = new MetricsController(prisma as PrismaService);

    await expect(controller.getMetrics(buildRequest(), buildResponse())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.outboxEvent.count).not.toHaveBeenCalled();
  });

  describe("when METRICS_TOKEN is configured", () => {
    beforeEach(() => {
      process.env.METRICS_TOKEN = "secret-token";
    });

    it("rejects a request without a matching x-metrics-token header", async () => {
      const prisma: Pick<PrismaService, "outboxEvent" | "deadLetterEvent"> = {
        outboxEvent: { count: vi.fn() } as unknown as PrismaService["outboxEvent"],
        deadLetterEvent: { count: vi.fn() } as unknown as PrismaService["deadLetterEvent"],
      };
      const controller = new MetricsController(prisma as PrismaService);

      await expect(controller.getMetrics(buildRequest(), buildResponse())).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.outboxEvent.count).not.toHaveBeenCalled();
    });

    it("accepts a request with the matching x-metrics-token header", async () => {
      const prisma: Pick<PrismaService, "outboxEvent" | "deadLetterEvent"> = {
        outboxEvent: { count: vi.fn().mockResolvedValue(0) } as unknown as PrismaService["outboxEvent"],
        deadLetterEvent: { count: vi.fn().mockResolvedValue(0) } as unknown as PrismaService["deadLetterEvent"],
      };
      const controller = new MetricsController(prisma as PrismaService);

      const body = await controller.getMetrics(buildRequest({ "x-metrics-token": "secret-token" }), buildResponse());

      expect(body).toContain("http_requests_total");
    });
  });
});
