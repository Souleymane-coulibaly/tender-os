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

  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 4000;
  await app.listen(port);
}

void bootstrap();
