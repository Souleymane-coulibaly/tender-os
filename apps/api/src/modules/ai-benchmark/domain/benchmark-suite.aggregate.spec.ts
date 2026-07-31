import { describe, expect, it } from "vitest";
import { PromptKey } from "../../analysis";
import { BenchmarkSuite } from "./benchmark-suite.aggregate";
import { BenchmarkSuiteStatus } from "./benchmark-suite-status";
import { BenchmarkSuiteEmptyError, BenchmarkSuiteNotDraftError } from "./errors";

const NOW = new Date("2026-07-30T10:00:00Z");

describe("BenchmarkSuite", () => {
  it("creates version 1 in DRAFT by default", () => {
    const suite = BenchmarkSuite.create({
      id: "suite-1",
      name: "Golden dataset — dates",
      promptKey: PromptKey.AnalyzeDocument,
      createdByUserId: "user-1",
      occurredAt: NOW,
    });

    expect(suite.version).toBe(1);
    expect(suite.status).toBe(BenchmarkSuiteStatus.Draft);
  });

  it("refuses to publish an empty suite", () => {
    const suite = BenchmarkSuite.create({
      id: "suite-1",
      name: "x",
      promptKey: PromptKey.AnalyzeDocument,
      createdByUserId: "user-1",
      occurredAt: NOW,
    });

    expect(() => suite.publish(false, NOW)).toThrow(BenchmarkSuiteEmptyError);
  });

  it("publishes a non-empty suite", () => {
    const suite = BenchmarkSuite.create({
      id: "suite-1",
      name: "x",
      promptKey: PromptKey.AnalyzeDocument,
      createdByUserId: "user-1",
      occurredAt: NOW,
    });

    suite.publish(true, NOW);
    expect(suite.status).toBe(BenchmarkSuiteStatus.Published);
  });

  it("refuses to mutate (assertMutable) a published suite", () => {
    const suite = BenchmarkSuite.create({
      id: "suite-1",
      name: "x",
      promptKey: PromptKey.AnalyzeDocument,
      createdByUserId: "user-1",
      occurredAt: NOW,
    });
    suite.publish(true, NOW);

    expect(() => suite.assertMutable()).toThrow(BenchmarkSuiteNotDraftError);
  });

  it("nextDraftVersion() creates a new DRAFT suite, incrementing the version, without mutating the original", () => {
    const suite = BenchmarkSuite.create({
      id: "suite-1",
      name: "Golden dataset — dates",
      promptKey: PromptKey.AnalyzeDocument,
      createdByUserId: "user-1",
      occurredAt: NOW,
    });
    suite.publish(true, NOW);

    const next = suite.nextDraftVersion({ id: "suite-2", createdByUserId: "user-2", occurredAt: NOW });

    expect(next.version).toBe(2);
    expect(next.status).toBe(BenchmarkSuiteStatus.Draft);
    expect(next.name).toBe(suite.name);
    expect(suite.status).toBe(BenchmarkSuiteStatus.Published); // l'original reste inchangé
  });
});
