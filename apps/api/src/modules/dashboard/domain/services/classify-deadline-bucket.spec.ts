import { describe, expect, it } from "vitest";
import { classifyDeadlineBucket } from "./classify-deadline-bucket";
import { DeadlineBucket } from "../enums";

const NOW = new Date("2026-06-15T10:00:00.000Z");

describe("classifyDeadlineBucket", () => {
  it("classifies a past deadline as OVERDUE", () => {
    expect(classifyDeadlineBucket(new Date("2026-06-14T23:59:00.000Z"), NOW)).toBe(DeadlineBucket.Overdue);
  });

  it("classifies a deadline later the same day as TODAY", () => {
    expect(classifyDeadlineBucket(new Date("2026-06-15T18:00:00.000Z"), NOW)).toBe(DeadlineBucket.Today);
  });

  it("classifies a deadline tomorrow as TOMORROW", () => {
    expect(classifyDeadlineBucket(new Date("2026-06-16T09:00:00.000Z"), NOW)).toBe(DeadlineBucket.Tomorrow);
  });

  it("classifies a deadline within 7 days as THIS_WEEK", () => {
    expect(classifyDeadlineBucket(new Date("2026-06-20T09:00:00.000Z"), NOW)).toBe(DeadlineBucket.ThisWeek);
  });

  it("classifies a deadline beyond 7 days as LATER", () => {
    expect(classifyDeadlineBucket(new Date("2026-07-01T09:00:00.000Z"), NOW)).toBe(DeadlineBucket.Later);
  });

  it("classifies a deadline exactly at the 7-day boundary as LATER", () => {
    expect(classifyDeadlineBucket(new Date("2026-06-22T00:00:00.000Z"), NOW)).toBe(DeadlineBucket.Later);
  });
});
