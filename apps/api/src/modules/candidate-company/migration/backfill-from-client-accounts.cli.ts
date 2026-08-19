import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { CandidateCompanyModule } from "../candidate-company.module";
import { CANDIDATE_COMPANY_REPOSITORY } from "../application/ports/candidate-company.repository";
import { AddCandidateEstablishmentUseCase } from "../application/use-cases/add-candidate-establishment.use-case";
import { CreateCandidateCompanyUseCase } from "../application/use-cases/create-candidate-company.use-case";
import type { CandidateCompanyRepository } from "../application/ports/candidate-company.repository";
import { ClientPortfolioModule } from "../../client-portfolio/client-portfolio.module";
import { ListClientAccountsUseCase } from "../../client-portfolio/application/use-cases/list-client-accounts.use-case";
import { CompanyProfileModule } from "../../company-profile";
import { GetCompanyProfileUseCase } from "../../company-profile/application/use-cases/get-company-profile.use-case";
import { IdentityModule } from "../../identity";
import { MembershipsModule } from "../../memberships";
import { OrganizationsModule } from "../../organizations/organizations.module";
import { OutboxWriterModule } from "../../outbox/outbox-writer.module";
import { CLOCK } from "../../../shared-kernel/clock";
import type { Clock } from "../../../shared-kernel/clock";
import { DatabaseModule } from "../../../shared-kernel/database.module";
import { SharedKernelModule } from "../../../shared-kernel/shared-kernel.module";
import { runCandidateCompanyBackfill } from "./backfill-from-client-accounts";

/**
 * Point d'entrée CLI SÉPARÉ de `backfill-from-client-accounts.ts` (même discipline que
 * `scripts/compliance-probe.cli.ts` — jamais d'effet de bord au niveau module dans le fichier qui
 * exporte la logique pure/testable ; seul CE fichier exécute réellement le backfill).
 *
 * Usage (mission §23/§24 — DRY RUN par défaut, exécution réelle explicite, JAMAIS staging/prod
 * pendant ce checkpoint sans instruction humaine) :
 *   DATABASE_URL=... AUTH_SECRET=... pnpm --filter @tenderos/api candidate-company:backfill -- --organization-id=<uuid>
 *   DATABASE_URL=... AUTH_SECRET=... pnpm --filter @tenderos/api candidate-company:backfill -- --organization-id=<uuid> --apply
 *
 * `--organization-id=<uuid>` est OBLIGATOIRE (jamais un backfill global implicite qui parcourrait
 * silencieusement toutes les organisations).
 *
 * ## Pourquoi ce script est exécuté COMPILÉ (`nest build` puis `node dist/...`, voir le script npm
 * `candidate-company:backfill`), jamais via `tsx` (correctif du finding P1-A2-001, audit round 2)
 * Une première version, exécutée via `tsx` (le seul exécuteur utilisé jusqu'ici dans ce dépôt pour ce
 * type de script), échouait au démarrage avec `UndefinedDependencyException`. Root-cause confirmée
 * par une sonde directe (`Reflect.getMetadata("design:paramtypes", ...)`, exécutée sous `tsx` sur
 * plusieurs classes) : `tsx`, via la version d'esbuild qu'il embarque, N'ÉMET PAS la métadonnée
 * `design:paramtypes` (`emitDecoratorMetadata`), même quand `tsconfig.json` l'active. Ce dépôt
 * s'appuie massivement sur l'injection implicite par type de classe (paramètre de constructeur SANS
 * `@Inject()`, ex. `CreateMembershipUseCase` → `GetCurrentUserUseCase`) — un motif qui fonctionne
 * normalement en production (`nest build`/`tsc` émet bien cette métadonnée) mais casse silencieusement
 * sous `tsx`, dès qu'un module NestJS entier (pas seulement 2-3 classes câblées à la main comme
 * `bootstrap-platform-owner.ts`/`compliance-probe.cli.ts`) est chargé. Ce n'est PAS un problème
 * spécifique à `candidate-company` ni à sa composition de modules : le même échec, sur un tout autre
 * provider, se reproduit à l'identique même en chargeant `AppModule` complet.
 * Plutôt que de patcher des dizaines de constructeurs dans `identity`/`memberships`/`client-portfolio`/
 * `company-profile` (hors périmètre A2, risque disproportionné) ou d'ajouter une nouvelle dépendance
 * (`ts-node`), ce script est exécuté via le chemin déjà éprouvé par toute l'application : `nest
 * build` (donc `tsc`, qui émet correctement `design:paramtypes`) puis `node` sur le JS compilé —
 * validé par exécution réelle bout-en-bout (dry-run, `--apply`, puis ré-exécution idempotente) contre
 * PostgreSQL local avant ce commentaire.
 *
 * Composition de modules volontairement MINIMALE (jamais `AppModule` complet) pour ne pas démarrer
 * les workers Outbox/market-watch/webhooks pendant un script one-off. `OutboxWriterModule` (écriture
 * seule, jamais le worker) et `OrganizationsModule` sont repris tels quels des propres `imports` de
 * `MembershipsModule` (`memberships.module.ts`) — nécessaires à sa résolution complète.
 */
@Module({
  imports: [SharedKernelModule, DatabaseModule, OutboxWriterModule, IdentityModule, OrganizationsModule, MembershipsModule, ClientPortfolioModule, CompanyProfileModule, CandidateCompanyModule],
})
class BackfillBootstrapModule {}

function parseArgs(argv: readonly string[]): { organizationId: string; dryRun: boolean } {
  const organizationIdArg = argv.find((arg) => arg.startsWith("--organization-id="));
  const organizationId = organizationIdArg?.split("=")[1];
  const apply = argv.includes("--apply");

  if (!organizationId) {
    throw new Error("Missing required --organization-id=<uuid> argument. Refusing to run an implicit global backfill.");
  }

  return { organizationId, dryRun: !apply };
}

async function main(): Promise<void> {
  const { organizationId, dryRun } = parseArgs(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(BackfillBootstrapModule, { logger: ["error", "warn"] });

  try {
    const summary = await runCandidateCompanyBackfill(
      {
        clientAccountLister: app.get(ListClientAccountsUseCase),
        companyProfileReader: app.get(GetCompanyProfileUseCase),
        candidateCompanyRepository: app.get<CandidateCompanyRepository>(CANDIDATE_COMPANY_REPOSITORY),
        createCandidateCompanyUseCase: app.get(CreateCandidateCompanyUseCase),
        addCandidateEstablishmentUseCase: app.get(AddCandidateEstablishmentUseCase),
        clock: app.get<Clock>(CLOCK),
      },
      { organizationId, dryRun },
    );

    // Résumé exploitable (mission §27) — items limités à des identifiants/classifications/messages
    // d'erreur métier, jamais une donnée personnelle/secrète (aucun champ de ce type n'est collecté
    // par `runCandidateCompanyBackfill`).
    console.log(JSON.stringify(summary, null, 2));

    if (dryRun) {
      console.log(`DRY RUN — nothing was written. Re-run with --apply to execute for real.`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
