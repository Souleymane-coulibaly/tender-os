import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { getRequiredEnv } from "./shared-kernel/env";
import { requestIdMiddleware } from "./shared-kernel/request-id.middleware";

function assertRequiredEnv(): void {
  getRequiredEnv("DATABASE_URL");
  getRequiredEnv("AUTH_SECRET");
}

async function bootstrap(): Promise<void> {
  assertRequiredEnv();

  const app = await NestFactory.create(AppModule);

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
