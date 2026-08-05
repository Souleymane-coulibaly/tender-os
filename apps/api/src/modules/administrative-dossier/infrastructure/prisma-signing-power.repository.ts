import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SigningPowerRepository } from "../application/ports/signing-power.repository";
import type { SigningPower } from "../domain/signing-power.aggregate";
import { toDomainSigningPower, toSigningPowerRow } from "./signing-power.persistence-mapper";

@Injectable()
export class PrismaSigningPowerRepository implements SigningPowerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(power: SigningPower): Promise<void> {
    await this.prisma.signingPower.create({ data: toSigningPowerRow(power) });
  }

  async findById(input: { organizationId: string; signingPowerId: string }): Promise<SigningPower | null> {
    const record = await this.prisma.signingPower.findFirst({ where: { id: input.signingPowerId, organizationId: input.organizationId } });
    return record ? toDomainSigningPower(record) : null;
  }

  async listByTenderId(input: { organizationId: string; tenderId: string }): Promise<readonly SigningPower[]> {
    const records = await this.prisma.signingPower.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomainSigningPower);
  }

  async save(power: SigningPower): Promise<void> {
    await this.prisma.signingPower.update({ where: { id: power.id }, data: toSigningPowerRow(power) });
  }
}
