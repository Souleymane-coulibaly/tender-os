import { describe, expect, it } from "vitest";
import { InvalidPageGuideKeyError } from "./errors";
import { PageGuideKey } from "./page-guide-key.value-object";
import { PageGuideAction, PageGuideState } from "./page-guide-state.entity";

describe("PageGuideKey", () => {
  it.each(["tenders", "tender-detail", "a", "0-9", "x".repeat(64)])("accepts the well-formed key %s", (value) => {
    expect(PageGuideKey.from(value).value).toBe(value);
  });

  it.each(["", "Tenders", "tender_detail", "tender detail", "tender/detail", "é", "x".repeat(65)])(
    "rejects the malformed key %j",
    (value) => {
      expect(() => PageGuideKey.from(value)).toThrow(InvalidPageGuideKeyError);
    },
  );
});

describe("PageGuideState.changesFor", () => {
  const at = new Date("2026-07-25T14:00:00Z");

  it("COMPLETE touches completedAt only", () => {
    expect(PageGuideState.changesFor(PageGuideAction.Complete, at)).toEqual({ completedAt: at });
  });

  it("DISMISS touches dismissedAt only", () => {
    expect(PageGuideState.changesFor(PageGuideAction.Dismiss, at)).toEqual({ dismissedAt: at });
  });
});
