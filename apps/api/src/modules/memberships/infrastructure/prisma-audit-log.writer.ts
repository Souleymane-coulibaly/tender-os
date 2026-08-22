import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AuditLogEntry, AuditLogWriter } from "../application/ports/audit-log-writer";

/**
 * Écrit dans `audit_logs` (docs/04-architecture/DATABASE_DESIGN.md §21.1). Sous-ensemble
 * des colonnes documentées : ipAddress/userAgent/traceId ne sont pas encore alimentés
 * (aucune source fiable disponible dans le contexte actuel des use cases).
 */
@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditLogEntry): Promise<void> {
    // Checkpoint TENDEROS-2.1-P2.3-E2 (audit Codex — correctif atomicité bootstrap Organization) —
    // `currentClient()` (au lieu de `this.prisma` brut) : rejoint la transaction ambiante ouverte
    // par `MembershipRepository.runExclusiveForActor` (voir `CreateOrganizationWithOwnerUseCase`).
    // Sans ce correctif, cette écriture visait une connexion SÉPARÉE de celle qui vient de créer
    // l'Organization dans la même opération (encore non committée, donc invisible sous READ
    // COMMITTED) — violation de contrainte de clé étrangère réelle, trouvée par
    // `organization-bootstrap-concurrency-http.integration.spec.ts`. Comportement inchangé hors de
    // ce contexte.
    await this.prisma.currentClient().auditLog.create({
      data: {
        id: randomUUID(),
        organizationId: entry.organizationId,
        actorType: "USER",
        actorId: entry.actorId,
        action: entry.action,
        resourceType: "organization_membership",
        resourceId: entry.resourceId,
        result: "SUCCESS",
        requestId: entry.requestId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
