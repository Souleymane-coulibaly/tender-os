import { Controller, Get, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { PrismaService } from "../prisma.service";
import { metricsRegistry, outboxDeadLetter, outboxPending } from "./metrics";

/**
 * Sprint 21 (hardening) — mission §57/§59. Endpoint texte au format d'exposition Prometheus, jamais
 * de tableau de bord ni d'infra de scraping déployée par TenderOS lui-même (mission "décision
 * d'infra au moment du déploiement"). Hors préfixe `/api/v1` (main.ts, même motif que `/health`) —
 * un endpoint d'exploitation n'est pas une route métier versionnée.
 *
 * Protection par jeton partagé (`METRICS_TOKEN`) — une variable ABSENTE ne fait jamais échouer le
 * DÉMARRAGE (mission §71-74, jamais une variable obligatoire au boot), mais son absence n'ouvre
 * plus l'accès par défaut dès que `NODE_ENV=production` (correctif réaudit externe — un défaut
 * "ouvert" pour un endpoint d'exploitation en production était une réserve légitime, même si les
 * métriques elles-même ne portent aucune donnée métier sensible). Hors production (développement/
 * test/réseau privé), l'absence de jeton laisse l'endpoint ouvert — l'inconfort d'exiger un jeton en
 * développement local n'apporte aucun bénéfice de sécurité réel.
 */
@Controller("metrics")
export class MetricsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getMetrics(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<string> {
    assertMetricsTokenValid(request);

    const [pending, deadLettered] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: { in: ["PENDING", "PROCESSING", "FAILED"] } } }),
      this.prisma.deadLetterEvent.count(),
    ]);
    outboxPending.set(pending);
    outboxDeadLetter.set(deadLettered);

    response.setHeader("Content-Type", metricsRegistry.contentType);
    return metricsRegistry.metrics();
  }
}

function assertMetricsTokenValid(request: Request): void {
  const expectedToken = process.env.METRICS_TOKEN;
  if (!expectedToken) {
    if (process.env.NODE_ENV === "production") {
      // Correctif réaudit externe — jamais un accès ouvert par défaut en production, même pour un
      // endpoint sans donnée métier sensible : configurer METRICS_TOKEN devient de fait requis dès
      // que NODE_ENV=production, sans pour autant faire échouer le DÉMARRAGE (l'échec reste au
      // niveau de la requête, jamais du boot).
      throw new UnauthorizedException("METRICS_TOKEN must be configured in production.");
    }
    return;
  }

  const provided = request.header("x-metrics-token");
  if (provided !== expectedToken) {
    throw new UnauthorizedException("Invalid or missing metrics token.");
  }
}
