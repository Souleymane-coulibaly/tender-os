import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AssertClientAccessUseCase } from "../../../client-portfolio";
import type { ExportJobRepository, ExportJobWithArtifact, GenerateFinalExportUseCase } from "../../../export";
import type { GetTenderUseCase } from "../../../tenders";
import { ApproveFinalVersionUseCase } from "./approve-final-version.use-case";
import type { FinalApprovalRepository } from "../ports/final-approval.repository";
import type { ValidationRunRepository } from "../ports/validation-run.repository";
import { ValidationRun } from "../../domain/validation-run.aggregate";

const FILE_HASH_PREVIEW = "a".repeat(64);
const FILE_HASH_FINAL = "b".repeat(64);

function buildUseCase(input: { generateFinalExportUseCase: Pick<GenerateFinalExportUseCase, "execute"> }) {
  const organizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const previewExportJobId = randomUUID();
  const finalExportJobId = randomUUID();
  const validationRunId = randomUUID();
  const now = new Date("2026-09-01T10:00:00Z");

  const run = ValidationRun.create({
    id: validationRunId,
    organizationId,
    clientAccountId,
    tenderId,
    exportJobId: previewExportJobId,
    runBy: randomUUID(),
    occurredAt: now,
    issues: [],
  });

  const previewExport: ExportJobWithArtifact = {
    job: { id: previewExportJobId, clientAccountId } as ExportJobWithArtifact["job"],
    artifact: { fileHash: FILE_HASH_PREVIEW } as ExportJobWithArtifact["artifact"],
  };

  const finalApprovalStore = new Map<string, { exportJobId: string; manifestHash: string; status: string }>();

  const finalApprovalRepository: FinalApprovalRepository = {
    create: vi.fn(async (approval) => {
      finalApprovalStore.set(approval.id, { exportJobId: approval.exportJobId, manifestHash: approval.manifestHash, status: approval.status });
    }),
    findById: vi.fn(),
    findActiveForTender: vi.fn(async () => {
      const active = [...finalApprovalStore.values()].find((a) => a.status === "ACTIVE");
      return active ? ({ ...active } as never) : null;
    }),
    save: vi.fn(),
  };

  const validationRunRepository: Pick<ValidationRunRepository, "findById"> = {
    findById: vi.fn(async () => run),
  };

  const exportJobRepository: Pick<ExportJobRepository, "findById"> = {
    findById: vi.fn(async () => previewExport),
  };

  const getTenderUseCase: Pick<GetTenderUseCase, "execute"> = {
    execute: vi.fn(async () => ({ clientAccountId }) as never),
  };

  const assertClientAccessUseCase: Pick<AssertClientAccessUseCase, "execute"> = {
    execute: vi.fn(async () => undefined),
  };

  const useCase = new ApproveFinalVersionUseCase(
    finalApprovalRepository,
    validationRunRepository as ValidationRunRepository,
    exportJobRepository as ExportJobRepository,
    getTenderUseCase as GetTenderUseCase,
    assertClientAccessUseCase as AssertClientAccessUseCase,
    input.generateFinalExportUseCase as GenerateFinalExportUseCase,
    { now: () => now },
    { generate: () => randomUUID() },
  );

  return { useCase, organizationId, tenderId, validationRunId, previewExportJobId, finalExportJobId, finalApprovalRepository, finalApprovalStore };
}

/**
 * Mission (audit de correction) — "Empêcher toute FinalApproval ACTIVE si la génération de
 * l'export FINAL échoue" : ce test force l'échec de `GenerateFinalExportUseCase` APRÈS que la
 * validation métier (contrôles bloquants) ait réussi, et prouve qu'aucune approbation active ne
 * persiste. Prouve aussi que l'approbation réellement créée référence l'export FINAL produit
 * (jamais l'aperçu PREVIEW) avec le hash de l'artefact FINAL (jamais celui de l'aperçu).
 */
describe("ApproveFinalVersionUseCase — atomicité", () => {
  it("ne persiste AUCUNE FinalApproval si GenerateFinalExportUseCase échoue après la validation des contrôles bloquants", async () => {
    const generateFinalExportUseCase: Pick<GenerateFinalExportUseCase, "execute"> = {
      execute: vi.fn(async () => {
        throw new Error("simulated final export rendering failure (storage outage)");
      }),
    };
    const { useCase, organizationId, tenderId, validationRunId, finalApprovalRepository, finalApprovalStore } = buildUseCase({ generateFinalExportUseCase });

    await expect(
      useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId, validationRunId }),
    ).rejects.toThrow("simulated final export rendering failure");

    expect(finalApprovalRepository.create).not.toHaveBeenCalled();
    expect(finalApprovalStore.size).toBe(0);
  });

  it("sur succès, l'approbation persistée référence l'export FINAL (id + hash), jamais l'aperçu PREVIEW", async () => {
    const generateFinalExportUseCase: Pick<GenerateFinalExportUseCase, "execute"> = {
      execute: vi.fn(async () => undefined as never),
    };
    const { useCase, organizationId, tenderId, validationRunId, previewExportJobId, finalExportJobId, finalApprovalStore } = buildUseCase({ generateFinalExportUseCase });
    (generateFinalExportUseCase.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ id: finalExportJobId, artifact: { fileHash: FILE_HASH_FINAL } });

    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId, validationRunId });

    expect(result.approval.exportJobId).toBe(finalExportJobId);
    expect(result.approval.exportJobId).not.toBe(previewExportJobId);
    expect(result.approval.manifestHash).toBe(FILE_HASH_FINAL);
    expect(result.approval.manifestHash).not.toBe(FILE_HASH_PREVIEW);
    expect(finalApprovalStore.size).toBe(1);
    const [stored] = [...finalApprovalStore.values()];
    expect(stored!.exportJobId).toBe(finalExportJobId);
    expect(stored!.manifestHash).toBe(FILE_HASH_FINAL);
  });

  it("refuse l'approbation si GenerateFinalExportUseCase renvoie un export FINAL sans artefact (jamais supposé silencieusement)", async () => {
    const generateFinalExportUseCase: Pick<GenerateFinalExportUseCase, "execute"> = {
      execute: vi.fn(async () => ({ id: randomUUID(), artifact: undefined }) as never),
    };
    const { useCase, organizationId, tenderId, validationRunId, finalApprovalStore } = buildUseCase({ generateFinalExportUseCase });

    await expect(useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId, validationRunId })).rejects.toThrow();

    expect(finalApprovalStore.size).toBe(0);
  });
});
