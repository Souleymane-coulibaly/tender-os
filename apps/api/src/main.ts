import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadDceConfig } from "./modules/dce/infrastructure/dce-config";
import { loadExtractionConfig } from "./modules/extraction/infrastructure/extraction-config";
import { getRequiredEnv } from "./shared-kernel/env";
import { requestIdMiddleware } from "./shared-kernel/request-id.middleware";

function assertRequiredEnv(): void {
  getRequiredEnv("DATABASE_URL");
  getRequiredEnv("AUTH_SECRET");
  // Échec précoce et explicite (mission P1-4) — DceModule revalide la même configuration via sa
  // propre factory DI, mais un échec ici survient avant même que NestFactory.create() ne
  // commence à construire le graphe de dépendances.
  loadDceConfig();
  // Mission Sprint 3 §20 — même stratégie, ExtractionModule revalide via sa propre factory DI.
  loadExtractionConfig();
}

async function bootstrap(): Promise<void> {
  assertRequiredEnv();

  // Mission Sprint 8A bis §44/§45 — le webhook Universign vérifie une JWS détachée calculée sur le
  // corps HTTP brut EXACT reçu sur le fil ; `rawBody: true` fait conserver ce buffer par Nest
  // (accessible via `RawBodyRequest<Request>.rawBody`) SANS désactiver le parsing JSON global dont
  // dépendent toutes les autres routes déjà validées (Sprints 0-7).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(requestIdMiddleware);
  // /health reste hors versionnement (contrat fixé par la fondation technique).
  app.setGlobalPrefix("api/v1", { exclude: ["health"] });

  // PORT (fourni par Railway) prime sur API_PORT (développement local) — fallback 4000.
  // Ne jamais fixer PORT manuellement dans Railway : la plateforme l'injecte elle-même.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  // Écoute explicite sur toutes les interfaces — nécessaire pour que le proxy Railway
  // atteigne le conteneur (le binding par défaut de Node peut se limiter à ::1/127.0.0.1
  // selon l'environnement).
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
