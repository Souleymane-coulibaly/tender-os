import { describe, expect, it } from "vitest";
import { NotWiredAsyncJobSubmitter } from "./not-wired-async-job.submitter";

describe("NotWiredAsyncJobSubmitter", () => {
  it("fails loudly rather than silently no-opping, since no queue infrastructure exists yet", async () => {
    const submitter = new NotWiredAsyncJobSubmitter();

    await expect(
      submitter.submit({ jobType: "dce.classify", organizationId: "org-1", payload: {} }),
    ).rejects.toThrow(/not wired/i);
  });
});
