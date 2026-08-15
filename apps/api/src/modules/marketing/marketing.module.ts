import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { SubmitDemoRequestUseCase } from "./application/use-cases/submit-demo-request.use-case";
import { DemoRequestController } from "./interfaces/http/demo-request.controller";

/**
 * V2 Sprint 23 (landing) — module MINIMAL pour la surface marketing publique (mission §27, aucun
 * CRM). `SubmitDemoRequestUseCase` réutilise `EMAIL_PROVIDER` (jamais un second pipeline email),
 * disponible partout via `SharedKernelModule` (`@Global()`, V2 Sprint 24) — plus besoin
 * d'importer `NotificationsModule` pour ça. `ThrottlerModule.forRoot` propre à ce module, même
 * motif que `IdentityModule` ("auth", ttl 60s) — un throttler nommé par domaine, jamais un rate
 * limit générique partagé (mission Sprint 21 §38).
 */
@Module({
  imports: [ThrottlerModule.forRoot([{ name: "marketing", ttl: 60_000, limit: 5 }])],
  controllers: [DemoRequestController],
  providers: [SubmitDemoRequestUseCase],
})
export class MarketingModule {}
