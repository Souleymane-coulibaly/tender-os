import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { RoutingPolicyRepository } from "../application/ports/routing-policy.repository";
import { RoutingPolicyStatus } from "../domain/routing-policy-status";
import { RoutingPolicyActivationConflictError } from "../domain/errors";
import type { RoutingPolicy } from "../domain/routing-policy.aggregate";
import type { PromptKey } from "../../analysis";
import { toDomain, toPersistence } from "./routing-policy.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaRoutingPolicyRepository implements RoutingPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; policyId: string }): Promise<RoutingPolicy | null> {
    const record = await this.prisma.routingPolicy.findFirst({ where: { id: input.policyId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async findActive(input: { organizationId: string; promptKey: PromptKey }): Promise<RoutingPolicy | null> {
    const record = await this.prisma.routingPolicy.findFirst({
      where: { organizationId: input.organizationId, promptKey: input.promptKey, status: RoutingPolicyStatus.Active },
    });
    return record ? toDomain(record) : null;
  }

  async findLatestVersion(input: { organizationId: string; promptKey: PromptKey }): Promise<RoutingPolicy | null> {
    const record = await this.prisma.routingPolicy.findFirst({
      where: { organizationId: input.organizationId, promptKey: input.promptKey },
      orderBy: { version: "desc" },
    });
    return record ? toDomain(record) : null;
  }

  async list(input: { organizationId: string }): Promise<readonly RoutingPolicy[]> {
    const records = await this.prisma.routingPolicy.findMany({
      where: { organizationId: input.organizationId },
      orderBy: [{ promptKey: "asc" }, { version: "desc" }],
    });
    return records.map(toDomain);
  }

  async create(policy: RoutingPolicy): Promise<void> {
    await this.prisma.routingPolicy.create({ data: toPersistence(policy) });
  }

  async save(policy: RoutingPolicy): Promise<void> {
    await this.prisma.routingPolicy.update({ where: { id: policy.id }, data: toPersistence(policy) });
  }

  /** Archive l'éventuelle version ACTIVE existante puis active `policy`, dans UNE transaction
   *  courte — jamais deux écritures séparées visibles indépendamment (mission §"aucune période
   *  avec deux versions actives incohérentes"). Audit Codex P1-1 : l'index unique partiel
   *  `routing_policies_org_prompt_key_active_key` (`WHERE status = 'ACTIVE'`, migration) est le
   *  véritable garde-fou DB — cette lecture-puis-écriture applicative seule ne suffirait pas sous
   *  isolation READ COMMITTED (la valeur par défaut de PostgreSQL) : deux transactions concurrentes
   *  peuvent toutes deux lire "aucune policy active" avant que l'une des deux ne commite. C'est
   *  l'index, pas la transaction, qui garantit qu'au plus une des deux `UPDATE` finales réussit ; la
   *  transaction perdante voit sa violation de contrainte traduite en
   *  `RoutingPolicyActivationConflictError`, jamais une exception Prisma brute, et est intégralement
   *  annulée (aucune archive orpheline : `ROLLBACK` défait aussi l'archivage déjà effectué dans la
   *  même transaction). */
  async activateAtomically(policy: RoutingPolicy): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const currentActive = await tx.routingPolicy.findFirst({
          where: {
            organizationId: policy.organizationId,
            promptKey: policy.promptKey,
            status: RoutingPolicyStatus.Active,
            id: { not: policy.id },
          },
        });
        if (currentActive) {
          await tx.routingPolicy.update({
            where: { id: currentActive.id },
            data: { status: RoutingPolicyStatus.Archived, archivedAt: policy.effectiveFrom ?? new Date() },
          });
        }
        await tx.routingPolicy.update({ where: { id: policy.id }, data: toPersistence(policy) });
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new RoutingPolicyActivationConflictError();
      }
      throw error;
    }
  }
}
