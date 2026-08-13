import { Controller, Get, HttpCode, HttpStatus, Res } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../shared-kernel/prisma.service";

export type HealthResponse = {
  status: "ok";
  service: "tenderos-api";
};

export type ReadinessResponse = {
  status: "ready" | "not_ready";
  service: "tenderos-api";
  checks: { database: "ok" | "unreachable" };
};

/**
 * Sprint 21 (hardening) — mission §53-56. `/health` (liveness) reste un contrat figé "process
 * vivant", JAMAIS dépendant d'une ressource externe (base de données comprise) — un pod ne doit
 * jamais être tué/recyclé juste parce que Postgres est temporairement injoignable, sans quoi une
 * panne DB se transformerait en boucle de redémarrage inutile. `/health/ready` vérifie en plus les
 * dépendances CRITIQUES (la base de données) — jamais les providers externes optionnels
 * (Microsoft/Google/IA/email), qui peuvent être DEGRADED sans jamais faire tomber la readiness de
 * TenderOS (mission §55 "ne pas rendre l'API 'not ready' parce que Microsoft est temporairement
 * down").
 */
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check(): HealthResponse {
    return { status: "ok", service: "tenderos-api" };
  }

  @Get("live")
  live(): HealthResponse {
    return { status: "ok", service: "tenderos-api" };
  }

  @Get("ready")
  @HttpCode(HttpStatus.OK)
  async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    try {
      await this.prisma.currentClient().$queryRaw`SELECT 1`;
      return { status: "ready", service: "tenderos-api", checks: { database: "ok" } };
    } catch {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: "not_ready", service: "tenderos-api", checks: { database: "unreachable" } };
    }
  }
}
