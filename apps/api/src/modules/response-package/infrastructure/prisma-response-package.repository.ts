import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  ResponsePackageCountByStatus,
  ResponsePackageDashboardRow,
  ResponsePackageDashboardScope,
  ResponsePackageRepository,
} from "../application/ports/response-package.repository";
import type { ResponsePackageStatus } from "../domain/enums";
import type { ResponsePackage } from "../domain/response-package.aggregate";
import { toDomainResponsePackage, toResponsePackageRow } from "./response-package.persistence-mapper";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12 — compose la restriction d'ACCÈS (`restrictToClientAccountIds`,
 * dérivée du ClientAccess de l'acteur) et le FILTRE demandé (`clientAccountId`, choisi dans l'UI) en
 * INTERSECTION stricte, appliquée par PostgreSQL. Auparavant le filtre demandé était appliqué en
 * mémoire par le Dashboard APRÈS avoir chargé tout le portefeuille accessible ; il est désormais
 * poussé dans le SQL. Un `clientAccountId` hors du périmètre accessible réduit à zéro résultat, il
 * ne peut JAMAIS élargir la portée — défense en profondeur, l'appelant vérifiant déjà l'accès.
 */
function resolveClientAccountWhere(scope: ResponsePackageDashboardScope): { clientAccountId?: string | { in: string[] } } {
  const { clientAccountId, restrictToClientAccountIds } = scope;
  if (clientAccountId === undefined) {
    return restrictToClientAccountIds === undefined ? {} : { clientAccountId: { in: [...restrictToClientAccountIds] } };
  }
  if (restrictToClientAccountIds === undefined) return { clientAccountId };
  return restrictToClientAccountIds.includes(clientAccountId) ? { clientAccountId } : { clientAccountId: { in: [] } };
}

@Injectable()
export class PrismaResponsePackageRepository implements ResponsePackageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(pkg: ResponsePackage): Promise<void> {
    await this.prisma.currentClient().responsePackage.create({ data: toResponsePackageRow(pkg) });
  }

  async save(pkg: ResponsePackage): Promise<void> {
    await this.prisma.currentClient().responsePackage.update({
      where: { id_organizationId: { id: pkg.id, organizationId: pkg.organizationId } },
      data: toResponsePackageRow(pkg),
    });
  }

  async findById(input: { organizationId: string; responsePackageId: string }): Promise<ResponsePackage | null> {
    const record = await this.prisma.currentClient().responsePackage.findFirst({ where: { id: input.responsePackageId, organizationId: input.organizationId } });
    return record ? toDomainResponsePackage(record) : null;
  }

  async findByScope(input: { organizationId: string; tenderId: string; lotId: string | null; clientAccountId: string }): Promise<ResponsePackage | null> {
    const record = await this.prisma.currentClient().responsePackage.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, lotId: input.lotId, clientAccountId: input.clientAccountId },
    });
    return record ? toDomainResponsePackage(record) : null;
  }

  async list(input: { organizationId: string; tenderId: string; lotId?: string | undefined; clientAccountId?: string | undefined }): Promise<readonly ResponsePackage[]> {
    const records = await this.prisma.currentClient().responsePackage.findMany({
      where: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        ...(input.lotId !== undefined ? { lotId: input.lotId } : {}),
        ...(input.clientAccountId !== undefined ? { clientAccountId: input.clientAccountId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toDomainResponsePackage);
  }

  async countByStatusForDashboard(scope: ResponsePackageDashboardScope): Promise<ResponsePackageCountByStatus> {
    // Le comptage est fait par PostgreSQL (`GROUP BY status`), jamais en mémoire applicative : le
    // coût est constant quel que soit le volume du portefeuille, et l'index
    // `(organization_id, client_account_id)` couvre exactement ce prédicat.
    const grouped = await this.prisma.currentClient().responsePackage.groupBy({
      by: ["status"],
      where: { organizationId: scope.organizationId, ...resolveClientAccountWhere(scope) },
      _count: { _all: true },
    });

    const countByStatus: Partial<Record<ResponsePackageStatus, number>> = {};
    for (const row of grouped) {
      countByStatus[row.status as ResponsePackageStatus] = row._count._all;
    }
    return countByStatus;
  }

  async listForDashboardTenders(scope: ResponsePackageDashboardScope & { tenderIds: readonly string[] }): Promise<readonly ResponsePackageDashboardRow[]> {
    // Jamais de requête `IN ()` vide envoyée à PostgreSQL pour un résultat connu d'avance.
    if (scope.tenderIds.length === 0) return [];

    const records = await this.prisma.currentClient().responsePackage.findMany({
      where: {
        organizationId: scope.organizationId,
        tenderId: { in: [...scope.tenderIds] },
        ...resolveClientAccountWhere(scope),
      },
      select: { id: true, tenderId: true, lotId: true, clientAccountId: true, status: true },
    });

    return records.map((record) => ({
      id: record.id,
      tenderId: record.tenderId,
      lotId: record.lotId,
      clientAccountId: record.clientAccountId,
      status: record.status as ResponsePackageStatus,
    }));
  }
}
