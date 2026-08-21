/**
 * Checkpoint TENDEROS-2.1-P2.2-F2.3 — fonction PURE, aucune E/S : détermine si un Tender est en
 * mode GLOBAL (un seul dossier de réponse attendu, comportement F2/F2.1 inchangé) ou en mode LOT
 * (un dossier requis par lot RÉELLEMENT sélectionné pour candidature). Ne recalcule AUCUNE règle
 * de fraîcheur/validation ici — seulement QUELS `ResponsePackage` sont pertinents pour QUEL
 * "créneau" requis (mission §12 "ne pas créer de moteur de résolution concurrent").
 *
 * Détection du mode (mission §6 "mixed state") : LOT dès qu'AU MOINS UN lot REQUIS (jamais un lot
 * non sélectionné, mission §14/§16) possède un `ResponsePackage` qui lui est explicitement scopé
 * (`lotId` correspondant). Sinon GLOBAL — préserve exactement le comportement F2/F2.1 pour tout
 * Tender qui n'utilise pas l'organisation par lot (mission §5 "ne jamais forcer des lots
 * synthétiques").
 */

export type ResponsePackageRequirementCandidate = Readonly<{ id: string; lotId: string | undefined; currentVersionId: string | undefined; status: string }>;

export type ResponsePackageRequirement = Readonly<{
  /** `undefined` = créneau global (mode GLOBAL, toujours un tableau à une seule entrée dans ce cas). */
  lotId: string | undefined;
  matchingPackages: readonly ResponsePackageRequirementCandidate[];
}>;

export function resolveResponsePackageRequirements(input: {
  requiredLotIds: readonly string[];
  packages: readonly ResponsePackageRequirementCandidate[];
}): readonly ResponsePackageRequirement[] {
  const requiredLotIdSet = new Set(input.requiredLotIds);
  const lotScopedForRequiredLots = input.packages.filter((pkg) => pkg.lotId !== undefined && requiredLotIdSet.has(pkg.lotId));

  if (lotScopedForRequiredLots.length === 0) {
    const globalPackages = input.packages.filter((pkg) => pkg.lotId === undefined);
    return [{ lotId: undefined, matchingPackages: globalPackages }];
  }

  return input.requiredLotIds.map((lotId) => ({
    lotId,
    matchingPackages: input.packages.filter((pkg) => pkg.lotId === lotId),
  }));
}
