import { describe, expect, it, vi } from "vitest";
import { GetRequiredResponsePackagesForTenderUseCase } from "./get-required-response-packages-for-tender.use-case";
import type { ListResponsePackagesUseCase } from "./list-response-packages.use-case";
import type { TenderLotRepository } from "../../../tenders";
import type { ResponsePackage } from "../../domain/response-package.aggregate";

const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeLot(id: string, selectedForResponse: boolean): { id: string; selectedForResponse: boolean } {
  return { id, selectedForResponse };
}
function fakeTenderLotRepository(lots: readonly { id: string; selectedForResponse: boolean }[]): TenderLotRepository {
  return { listByTender: vi.fn(async () => lots) } as unknown as TenderLotRepository;
}
function fakePackage(id: string, lotId: string | undefined): ResponsePackage {
  return { id, lotId, currentVersionId: undefined, status: "DRAFT" } as unknown as ResponsePackage;
}
function fakeListResponsePackagesUseCase(packages: readonly ResponsePackage[]): ListResponsePackagesUseCase {
  return { execute: vi.fn(async () => packages) } as unknown as ListResponsePackagesUseCase;
}

describe("GetRequiredResponsePackagesForTenderUseCase", () => {
  it("mission §3 — required lot set comes from TenderLot.selectedForResponse, never from ResponsePackage/pricing/checklist existence", async () => {
    const useCase = new GetRequiredResponsePackagesForTenderUseCase(
      fakeTenderLotRepository([fakeLot("lot-a", true), fakeLot("lot-b", true), fakeLot("lot-c", false)]),
      fakeListResponsePackagesUseCase([fakePackage("pkg-a", "lot-a"), fakePackage("pkg-b", "lot-b"), fakePackage("pkg-c", "lot-c")]),
    );

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    // lot-c exists and even has its own package, but selectedForResponse=false — never a requirement.
    expect(result.map((r) => r.lotId)).toEqual(["lot-a", "lot-b"]);
  });

  it("mission §5 — a Tender with zero lots degenerates to GLOBAL mode", async () => {
    const useCase = new GetRequiredResponsePackagesForTenderUseCase(fakeTenderLotRepository([]), fakeListResponsePackagesUseCase([fakePackage("pkg-global", undefined)]));

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(result).toEqual([{ lotId: undefined, matchingPackages: [{ id: "pkg-global", lotId: undefined, currentVersionId: undefined, status: "DRAFT" }] }]);
  });
});
