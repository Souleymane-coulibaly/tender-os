import { describe, expect, it, vi } from "vitest";
import type { PageGuideStateSummary } from "../../application/dtos";
import type { ListPageGuideStatesUseCase } from "../../application/use-cases/list-page-guide-states.use-case";
import type { RecordPageGuideActionUseCase } from "../../application/use-cases/record-page-guide-action.use-case";
import { PageGuidesController } from "./page-guides.controller";
import { PageGuideKeyParamSchema, RecordPageGuideActionBodySchema } from "./schemas";

const ACTOR = { userId: "user-1", sessionId: "session-1" };
const COMPLETED: PageGuideStateSummary = { guideKey: "tenders", completedAt: "2026-07-25T14:00:00.000Z" };

function createController() {
  const listPageGuideStatesUseCase = {
    execute: vi.fn().mockResolvedValue([COMPLETED]),
  } as unknown as ListPageGuideStatesUseCase;
  const recordPageGuideActionUseCase = {
    execute: vi.fn().mockResolvedValue(COMPLETED),
  } as unknown as RecordPageGuideActionUseCase;

  return {
    controller: new PageGuidesController(listPageGuideStatesUseCase, recordPageGuideActionUseCase),
    listPageGuideStatesUseCase,
    recordPageGuideActionUseCase,
  };
}

describe("PageGuidesController", () => {
  it("list delegates with the actor's id and wraps the result in { items }", async () => {
    const { controller, listPageGuideStatesUseCase } = createController();

    const response = await controller.list(ACTOR);

    expect(listPageGuideStatesUseCase.execute).toHaveBeenCalledWith({ userId: "user-1" });
    expect(response).toEqual({ items: [COMPLETED] });
  });

  it("record delegates with the actor's id (never an id from the request) and returns the bare item", async () => {
    const { controller, recordPageGuideActionUseCase } = createController();

    const response = await controller.record(ACTOR, "tenders", { action: "COMPLETE" });

    expect(recordPageGuideActionUseCase.execute).toHaveBeenCalledWith({ userId: "user-1", guideKey: "tenders", action: "COMPLETE" });
    expect(response).toEqual(COMPLETED);
    expect(response).not.toHaveProperty("dismissedAt");
  });
});

describe("page guide HTTP schemas", () => {
  it.each(["tenders", "tender-detail", "x".repeat(64)])("accepts the guide key %s", (value) => {
    expect(PageGuideKeyParamSchema.safeParse(value).success).toBe(true);
  });

  it.each(["Tenders", "tender_detail", "x".repeat(65), ""])("rejects the guide key %j", (value) => {
    expect(PageGuideKeyParamSchema.safeParse(value).success).toBe(false);
  });

  it("accepts COMPLETE and DISMISS only, with no extra field", () => {
    expect(RecordPageGuideActionBodySchema.safeParse({ action: "COMPLETE" }).success).toBe(true);
    expect(RecordPageGuideActionBodySchema.safeParse({ action: "DISMISS" }).success).toBe(true);
    expect(RecordPageGuideActionBodySchema.safeParse({ action: "START" }).success).toBe(false);
    expect(RecordPageGuideActionBodySchema.safeParse({}).success).toBe(false);
    expect(RecordPageGuideActionBodySchema.safeParse({ action: "COMPLETE", userId: "other" }).success).toBe(false);
  });
});
