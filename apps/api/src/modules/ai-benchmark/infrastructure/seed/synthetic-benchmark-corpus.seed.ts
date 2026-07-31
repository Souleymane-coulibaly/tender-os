import { randomUUID } from "node:crypto";
import { PromptKey } from "../../../analysis";
import { BenchmarkCase } from "../../domain/benchmark-case.entity";
import { BenchmarkSuite } from "../../domain/benchmark-suite.aggregate";
import { PrismaBenchmarkCaseRepository } from "../prisma-benchmark-case.repository";
import { PrismaBenchmarkSuiteRepository } from "../prisma-benchmark-suite.repository";
import { PrismaService } from "../../../../shared-kernel/prisma.service";

/**
 * Corpus de référence minimal mais représentatif (Sprint 5.2 §"Golden dataset") — jamais un extrait
 * de document client réel : chaque phrase ci-dessous est fictive, écrite pour ce sprint. Script
 * autonome, invoqué manuellement (jamais par `prisma db seed`/`migrate reset`) — même motif que
 * `prisma/seed-staging.ts`. Idempotent : ne recrée pas une suite du même nom déjà présente.
 *
 * Volontairement représentatif plutôt qu'exhaustif (un sous-ensemble des catégories du brief —
 * dates, critères, exigences, provenance) : le corpus complet grandira via l'interface
 * d'administration (`POST /ai-benchmark/suites/:id/cases`), pas en modifiant ce script à chaque
 * fois — voir "Limites connues" du rapport final.
 */
export async function seedSyntheticBenchmarkCorpus(prisma: PrismaService): Promise<void> {
  const suiteRepository = new PrismaBenchmarkSuiteRepository(prisma);
  const caseRepository = new PrismaBenchmarkCaseRepository(prisma);
  const now = new Date();

  const existing = await suiteRepository.findLatestVersionByName({ name: "Golden dataset — extraction document (FR/EN)" });
  if (existing) {
    return;
  }

  const suite = BenchmarkSuite.create({
    id: randomUUID(),
    name: "Golden dataset — extraction document (FR/EN)",
    promptKey: PromptKey.AnalyzeDocument,
    description: "Corpus synthétique couvrant dates, critères, exigences et provenance — aucune donnée client réelle.",
    createdByUserId: "system-seed",
    occurredAt: now,
  });
  await suiteRepository.create(suite);

  const cases = [
    BenchmarkCase.create({
      id: randomUUID(),
      suiteId: suite.id,
      inputVariables: { text: "La date limite de remise des offres est fixée au 30 septembre 2026 à 12h00." },
      expectedOutput: { submissionDeadline: "2026-09-30T12:00:00+02:00" },
      difficulty: "EASY",
      language: "FR",
      businessCategory: "DEADLINE",
      occurredAt: now,
    }),
    BenchmarkCase.create({
      id: randomUUID(),
      suiteId: suite.id,
      inputVariables: { text: "Le présent règlement de la consultation ne mentionne aucune date de visite obligatoire." },
      expectedOutput: { submissionDeadline: null },
      difficulty: "MEDIUM",
      language: "FR",
      businessCategory: "DEADLINE",
      occurredAt: now,
    }),
    BenchmarkCase.create({
      id: randomUUID(),
      suiteId: suite.id,
      inputVariables: {
        text: "Critères d'attribution : prix (60%), valeur technique (30%), délai d'exécution (10%).",
      },
      expectedOutput: { criteria: [{ name: "Prix", weight: 60 }, { name: "Valeur technique", weight: 30 }, { name: "Délai d'exécution", weight: 10 }], totalWeight: 100 },
      difficulty: "EASY",
      language: "FR",
      businessCategory: "CRITERIA",
      occurredAt: now,
    }),
    BenchmarkCase.create({
      id: randomUUID(),
      suiteId: suite.id,
      inputVariables: { text: "Critères d'attribution : prix (50%), valeur technique (40%)." },
      expectedOutput: { criteria: [{ name: "Prix", weight: 50 }, { name: "Valeur technique", weight: 40 }], totalWeight: 90 },
      difficulty: "HARD",
      language: "FR",
      businessCategory: "CRITERIA",
      occurredAt: now,
    }),
    BenchmarkCase.create({
      id: randomUUID(),
      suiteId: suite.id,
      inputVariables: { text: "Le candidat doit fournir une attestation d'assurance responsabilité civile professionnelle." },
      expectedOutput: { requirements: [{ label: "Attestation d'assurance responsabilité civile professionnelle", isMandatory: true }] },
      difficulty: "EASY",
      language: "FR",
      businessCategory: "REQUIREMENT",
      occurredAt: now,
    }),
    BenchmarkCase.create({
      id: randomUUID(),
      suiteId: suite.id,
      inputVariables: { text: "The submission deadline is set for September 30, 2026 at 12:00 PM CET." },
      expectedOutput: { submissionDeadline: "2026-09-30T12:00:00+02:00" },
      difficulty: "EASY",
      language: "EN",
      businessCategory: "DEADLINE",
      occurredAt: now,
    }),
  ];

  for (const benchmarkCase of cases) {
    await caseRepository.create(benchmarkCase);
  }
}
