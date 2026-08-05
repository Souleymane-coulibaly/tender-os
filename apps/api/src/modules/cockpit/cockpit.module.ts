import { Module } from "@nestjs/common";
import { AnalysisModule } from "../analysis";
import { ClientPortfolioModule } from "../client-portfolio";
import { DceModule } from "../dce";
import { DeliverablesModule } from "../deliverables";
import { DocumentsModule } from "../documents";
import { ExportModule } from "../export";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { PricingModule } from "../pricing";
import { SignatureModule } from "../signature";
import { SubmissionModule } from "../submission";
import { SubmissionPackageModule } from "../submission-package";
import { TendersModule } from "../tenders";
import { ValidationModule } from "../validation";
import { GetTenderCockpitUseCase } from "./application/use-cases/get-tender-cockpit.use-case";
import { CockpitController } from "./interfaces/http/cockpit.controller";

/**
 * Module Cockpit (Sprint 8A.2) — architecture validée explicitement avec l'utilisateur : les 9
 * modules agrégés ci-dessous dépendent TOUS de `tenders` (GetTenderUseCase/AssertClientAccessUseCase),
 * donc `tenders` ne peut jamais les importer en retour sans créer un cycle Nest immédiat. Cockpit
 * vit à la place dans un module dédié, STRICTEMENT en aval (import dans un seul sens) : aucun des
 * modules ci-dessous n'importe jamais `CockpitModule` — même motif que Deliverables → Export/
 * Generation/Validation/Pricing/Signature/SubmissionPackage (Sprint 8A.1). N'accède à AUCUN
 * repository Prisma directement, uniquement aux use cases de LECTURE déjà publics de chaque
 * module (voir la docstring de `GetTenderCockpitUseCase`).
 *
 * `DeliverablesModule` importe déjà `ExportModule`/`ValidationModule`/`PricingModule`/
 * `SignatureModule`/`SubmissionPackageModule`/`DocumentsModule` — les réimporter ici est
 * idempotent côté Nest (chaque module reste un singleton par arbre de modules) et rend la
 * dépendance de Cockpit envers CHACUN d'eux explicite, plutôt que de compter implicitement sur le
 * graphe de Deliverables.
 */
@Module({
  imports: [
    IdentityModule,
    MembershipsModule,
    TendersModule,
    ClientPortfolioModule,
    DceModule,
    DocumentsModule,
    AnalysisModule,
    PricingModule,
    DeliverablesModule,
    ExportModule,
    ValidationModule,
    SignatureModule,
    SubmissionPackageModule,
    SubmissionModule,
  ],
  controllers: [CockpitController],
  providers: [GetTenderCockpitUseCase],
})
export class CockpitModule {}
