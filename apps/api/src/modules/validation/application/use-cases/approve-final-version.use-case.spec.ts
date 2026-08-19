import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { TenderBusinessAnalysisNotFoundError } from "../../../analysis";
import type { AssertClientAccessUseCase } from "../../../client-portfolio";
import type { ExportJobRepository, ExportJobWithArtifact, GenerateFinalExportUseCase } from "../../../export";
import type { GetTenderUseCase } from "../../../tenders";
import { ApproveFinalVersionUseCase } from "./approve-final-version.use-case";
import type { FinalApprovalRepository } from "../ports/final-approval.repository";
import type { ValidationRunRepository } from "../ports/validation-run.repository";
import { ValidationRun } from "../../domain/validation-run.aggregate";

const FILE_HASH_PREVIEW = "a".repeat(64);
const FILE_HASH_FINAL = "b".repeat(64);

function buildUseCase(input: {
  generateFinalExportUseCase: Pick<GenerateFinalExportUseCase, "execute">;
  getEffectiveTenderAnalysisSummaryUseCase?: { execute: ReturnType<typeof vi.fn> };
  getTechnicalMemoRevisionFingerprintForTenderUseCase?: { execute: ReturnType<typeof vi.fn> };
}) {
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

  const finalApprovalStore = new Map<
    string,
    { exportJobId: string; manifestHash: string; status: string; candidateCompanyId?: string; analysisVersion?: number; technicalMemoRevisionFingerprint?: string }
  >();

  const finalApprovalRepository: FinalApprovalRepository = {
    create: vi.fn(async (approval) => {
      finalApprovalStore.set(approval.id, {
        exportJobId: approval.exportJobId,
        manifestHash: approval.manifestHash,
        status: approval.status,
        candidateCompanyId: approval.candidateCompanyId,
        analysisVersion: approval.analysisVersion,
        technicalMemoRevisionFingerprint: approval.technicalMemoRevisionFingerprint,
      });
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
    execute: vi.fn(async () => ({ clientAccountId, candidateCompanyId: undefined }) as never),
  };

  const assertClientAccessUseCase: Pick<AssertClientAccessUseCase, "execute"> = {
    execute: vi.fn(async () => undefined),
  };

  // Checkpoint 2.1-P2.1-FIX-E — par défaut, aucune analyse n'a jamais réussi pour ce tender
  // (`TenderBusinessAnalysisNotFoundError`, même motif que `GetTenderBusinessAnalysisUseCase`) et
  // aucun Technical Memo n'existe — dimensions non applicables, jamais une dépendance fabriquée
  // dans les tests qui ne s'intéressent pas à la provenance.
  const getEffectiveTenderAnalysisSummaryUseCase = input.getEffectiveTenderAnalysisSummaryUseCase ?? {
    execute: vi.fn(async () => {
      throw new TenderBusinessAnalysisNotFoundError();
    }),
  };
  const getTechnicalMemoRevisionFingerprintForTenderUseCase = input.getTechnicalMemoRevisionFingerprintForTenderUseCase ?? { execute: vi.fn(async () => undefined) };

  const useCase = new ApproveFinalVersionUseCase(
    finalApprovalRepository,
    validationRunRepository as ValidationRunRepository,
    exportJobRepository as ExportJobRepository,
    getTenderUseCase as GetTenderUseCase,
    assertClientAccessUseCase as AssertClientAccessUseCase,
    input.generateFinalExportUseCase as GenerateFinalExportUseCase,
    { now: () => now },
    { generate: () => randomUUID() },
    getEffectiveTenderAnalysisSummaryUseCase as never,
    getTechnicalMemoRevisionFingerprintForTenderUseCase as never,
  );

  return { useCase, organizationId, tenderId, validationRunId, previewExportJobId, finalExportJobId, finalApprovalRepository, finalApprovalStore, getTenderUseCase };
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

describe("ApproveFinalVersionUseCase — provenance du dossier (Checkpoint 2.1-P2.1-FIX-E)", () => {
  function successfulExport(finalExportJobId: string) {
    const generateFinalExportUseCase: Pick<GenerateFinalExportUseCase, "execute"> = {
      execute: vi.fn(async () => ({ id: finalExportJobId, artifact: { fileHash: FILE_HASH_FINAL } })) as never,
    };
    return generateFinalExportUseCase;
  }

  it("capture candidateCompanyId/analysisVersion/technicalMemoRevisionFingerprint résolus au moment de l'approbation", async () => {
    const finalExportJobId = randomUUID();
    const getEffectiveTenderAnalysisSummaryUseCase = { execute: vi.fn(async () => ({ analysisVersion: 3, dceRevision: 3, analysisFreshness: "CURRENT" })) };
    const getTechnicalMemoRevisionFingerprintForTenderUseCase = { execute: vi.fn(async () => "fingerprint-abc") };
    const { useCase, organizationId, tenderId, validationRunId, finalApprovalStore, getTenderUseCase } = buildUseCase({
      generateFinalExportUseCase: successfulExport(finalExportJobId),
      getEffectiveTenderAnalysisSummaryUseCase,
      getTechnicalMemoRevisionFingerprintForTenderUseCase,
    });
    (getTenderUseCase.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ clientAccountId: randomUUID(), candidateCompanyId: "candidate-alpha" });

    await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId, validationRunId });

    const [stored] = [...finalApprovalStore.values()];
    expect(stored!.candidateCompanyId).toBe("candidate-alpha");
    expect(stored!.analysisVersion).toBe(3);
    expect(stored!.technicalMemoRevisionFingerprint).toBe("fingerprint-abc");
  });

  // BLOQUANT (mission §15/§17) — jamais une dépendance fabriquée : si aucune analyse n'a jamais
  // réussi pour ce tender, l'approbation doit réussir normalement (l'absence d'analyse n'est jamais
  // une raison de bloquer une approbation par ailleurs légitime) et capturer `undefined`, jamais
  // une valeur inventée.
  it("BLOQUANT — une approbation réussit normalement et capture analysisVersion=undefined quand aucune analyse n'a jamais réussi pour ce tender", async () => {
    const finalExportJobId = randomUUID();
    const { useCase, organizationId, tenderId, validationRunId, finalApprovalStore } = buildUseCase({ generateFinalExportUseCase: successfulExport(finalExportJobId) });

    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId, validationRunId });

    expect(result.approval).toBeTruthy();
    const [stored] = [...finalApprovalStore.values()];
    expect(stored!.analysisVersion).toBeUndefined();
  });

  it("propage toute autre erreur inattendue de GetEffectiveTenderAnalysisSummaryUseCase (jamais silencieusement avalée)", async () => {
    const finalExportJobId = randomUUID();
    const getEffectiveTenderAnalysisSummaryUseCase = {
      execute: vi.fn(async () => {
        throw new Error("simulated unexpected database failure");
      }),
    };
    const { useCase, organizationId, tenderId, validationRunId } = buildUseCase({ generateFinalExportUseCase: successfulExport(finalExportJobId), getEffectiveTenderAnalysisSummaryUseCase });

    await expect(useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId, validationRunId })).rejects.toThrow("simulated unexpected database failure");
  });
});
