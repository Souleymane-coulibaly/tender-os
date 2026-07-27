import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { DceModule } from "./modules/dce/dce.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { MembershipsModule } from "./modules/memberships/memberships.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { PlatformAdministrationModule } from "./modules/platform-administration/platform-administration.module";
import { TendersModule } from "./modules/tenders/tenders.module";
import { DatabaseModule } from "./shared-kernel/database.module";
import { SharedKernelModule } from "./shared-kernel/shared-kernel.module";

@Module({
  imports: [
    SharedKernelModule,
    DatabaseModule,
    HealthModule,
    IdentityModule,
    OrganizationsModule,
    MembershipsModule,
    PlatformAdministrationModule,
    TendersModule,
    DocumentsModule,
    DceModule,
  ],
})
export class AppModule {}
