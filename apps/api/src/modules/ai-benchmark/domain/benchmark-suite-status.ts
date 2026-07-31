export const BenchmarkSuiteStatus = {
  Draft: "DRAFT",
  Published: "PUBLISHED",
} as const;

export type BenchmarkSuiteStatus = (typeof BenchmarkSuiteStatus)[keyof typeof BenchmarkSuiteStatus];
