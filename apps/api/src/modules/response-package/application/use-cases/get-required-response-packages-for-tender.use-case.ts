import { Inject, Injectable } from "@nestjs/common";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../../../tenders";
import { resolveResponsePackageRequirements, type ResponsePackageRequirement } from "../../domain/services/resolve-response-package-requirements";
import { ListResponsePackagesUseCase } from "./list-response-packages.use-case";

export type GetRequiredResponsePackagesForTenderQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/**
 * Checkpoint TENDEROS-2.1-P2.2-F2.3 — autorité UNIQUE de résolution "quels dossiers de réponse sont
 * REQUIS pour ce Tender" (mission §3 "REQUIRED_LOT_SET_SOT"), réexportée pour `submission`. Compose
 * des LECTURES pures de use cases/repositories déjà existants — ne recalcule AUCUNE règle de
 * fraîcheur/validation (déjà la responsabilité de `GetResponsePackageFreshnessUseCase`/
 * `GetSubmittableResponsePackageVersionUseCase`).
 *
 * SOT du périmètre requis (mission §3, preuve code) : `TenderLot.selectedForResponse === true`
 * (colonne dénormalisée, GO/NO-GO/scoring la consomment déjà comme LA décision métier actionnable
 * "lot sélectionné ou non pour réponse" — voir `tender-lot.entity.ts`), jamais inférée depuis
 * l'existence d'un ResponsePackage/Pricing/Checklist (mission §4, interdiction explicite). Un
 * Tender sans aucun `TenderLot` (ou dont aucun lot n'est sélectionné) a un périmètre requis vide —
 * dégénère exactement vers le mode GLOBAL de `resolveResponsePackageRequirements`.
 */
@Injectable()
export class GetRequiredResponsePackagesForTenderUseCase {
  constructor(
    @Inject(TENDER_LOT_REPOSITORY) private readonly tenderLotRepository: TenderLotRepository,
    private readonly listResponsePackagesUseCase: ListResponsePackagesUseCase,
  ) {}

  async execute(query: GetRequiredResponsePackagesForTenderQuery): Promise<readonly ResponsePackageRequirement[]> {
    const [lots, packages] = await Promise.all([
      this.tenderLotRepository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId }),
      this.listResponsePackagesUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId }),
    ]);

    const requiredLotIds = lots.filter((lot) => lot.selectedForResponse).map((lot) => lot.id);

    return resolveResponsePackageRequirements({
      requiredLotIds,
      packages: packages.map((pkg) => ({ id: pkg.id, lotId: pkg.lotId, currentVersionId: pkg.currentVersionId, status: pkg.status })),
    });
  }
}
