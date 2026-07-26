import { Inject, Injectable } from "@nestjs/common";
import type { OrganizationStatus } from "../../domain/organization-status";
import { ORGANIZATION_REPOSITORY, type OrganizationRepository } from "../ports/organization.repository";

export type CountOrganizationsByStatusResult = Record<OrganizationStatus, number>;

/**
 * Indicateur technique simple (comptage déjà disponible via le repository),
 * pas un moteur d'analytics — usage réservé aux tableaux de bord internes.
 */
@Injectable()
export class CountOrganizationsByStatusUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(): Promise<CountOrganizationsByStatusResult> {
    return this.organizationRepository.countByStatus();
  }
}
