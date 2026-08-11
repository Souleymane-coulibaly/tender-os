import { Inject, Injectable } from "@nestjs/common";
import { PackageItemNotFoundError, ResponsePackageVersionValidatedError } from "../../domain/errors";
import type { PackageItem } from "../../domain/package-item.entity";
import type { ResponsePackageVersion } from "../../domain/response-package-version.entity";
import { PACKAGE_ITEM_REPOSITORY, type PackageItemRepository } from "../ports/package-item.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY, type ResponsePackageVersionRepository } from "../ports/response-package-version.repository";

/** Garde partagée avant toute mutation d'item (qualification, sélection de document) — factorisée
 *  pour ne jamais dupliquer 3 fois la même vérification (même motif que
 *  `PricingScheduleLineEditGuard`, Sprint 13) : anti-IDOR (l'item doit réellement appartenir AU
 *  dossier demandé) + immutabilité post-validation (mission §50). */
@Injectable()
export class PackageItemEditGuard {
  constructor(
    @Inject(PACKAGE_ITEM_REPOSITORY) private readonly itemRepository: PackageItemRepository,
    @Inject(RESPONSE_PACKAGE_VERSION_REPOSITORY) private readonly versionRepository: ResponsePackageVersionRepository,
  ) {}

  async loadEditableItem(input: { organizationId: string; responsePackageId: string; packageItemId: string }): Promise<{ item: PackageItem; version: ResponsePackageVersion }> {
    const item = await this.itemRepository.findById({ organizationId: input.organizationId, packageItemId: input.packageItemId });
    if (!item) {
      throw new PackageItemNotFoundError();
    }

    const version = await this.versionRepository.findById({ organizationId: input.organizationId, responsePackageVersionId: item.responsePackageVersionId });
    if (!version || version.responsePackageId !== input.responsePackageId) {
      throw new PackageItemNotFoundError();
    }
    if (version.isValidated) {
      throw new ResponsePackageVersionValidatedError();
    }

    return { item, version };
  }
}
