import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";

/**
 * Sprint 21 (hardening) — preuve bout-en-bout que `GET /metrics` est réellement monté hors
 * versionnement (comme `/health`, main.ts) et que `MetricsHttpInterceptor` (enregistré globalement
 * via `APP_INTERCEPTOR`, shared-kernel.module.ts) incrémente bien `http_requests_total` pour une
 * requête réelle passée dans le pipeline HTTP complet — jamais seulement vérifié au niveau unitaire
 * du contrôleur (metrics.controller.spec.ts), qui n'exerce ni le routage ni l'intercepteur.
 */
describe("GET /metrics — real HTTP, unversioned endpoint", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health", "metrics"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it("is reachable unversioned (never under /api/v1) and exposes Prometheus text", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain("http_requests_total");
    expect(body).toContain("outbox_pending");
  });

  it("BLOQUANT — a real HTTP request through the full pipeline increments http_requests_total, observed on the next scrape", async () => {
    await fetch(`${baseUrl}/health`);
    const res = await fetch(`${baseUrl}/metrics`);
    const body = await res.text();

    expect(body).toMatch(/http_requests_total\{method="GET",route="\/health",status="200"\}\s+\d+/);
  });
});
