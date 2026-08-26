/** H7 PROOF — éclate `scenarios.json` en artefacts nommés et vérifie l'absence de nouvelle fuite. */
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "node:fs";

const A = "artifacts/h7-proof";
const d = JSON.parse(readFileSync(`${A}/scenarios.json`, "utf8"));
const byLabel = Object.fromEntries(d.scenarios.map((s) => [s.label, s]));
const meta = { batchSize: d.batchSize, preExistingClaimable: d.preExistingClaimable };

writeFileSync(`${A}/01-cold.json`, JSON.stringify({ ...meta, scenario: byLabel.COLD }, null, 2));
writeFileSync(`${A}/02-backlog-100.json`, JSON.stringify({ ...meta, scenario: byLabel.BACKLOG_100 }, null, 2));
writeFileSync(`${A}/03-backlog-500.json`, JSON.stringify({ ...meta, scenario: byLabel.BACKLOG_500 }, null, 2));
writeFileSync(
  `${A}/06-amplifiers.json`,
  JSON.stringify({ ...meta, noHandler: byLabel.NO_HANDLER, expiredProcessing: byLabel.EXPIRED_PROCESSING }, null, 2),
);
writeFileSync(
  `${A}/04-real-suite.json`,
  JSON.stringify(
    {
      suite: "src/modules/workspace/interfaces/http/workspace-http.integration.spec.ts",
      cold: { exitCode: 0, seconds: 88, files: "1 passed", tests: "18 passed", claimableBefore: 0 },
      backlog500: {
        exitCode: 1,
        seconds: 93,
        files: "1 failed",
        tests: "1 failed | 17 passed",
        claimableBefore: 500,
        failingTest:
          "BLOQUANT — mission §26/§31/§50: full flow on RESPONSE_PACKAGE_VERSION once VALIDATED — reviewer authority reuses ValidateResponsePackage, both request and decision create real Notification rows, activity reflects it",
        failureReason: "Test timed out in 5000ms",
      },
    },
    null,
    2,
  ),
);

const p = new PrismaClient();
const q = (s) => p.$queryRawUnsafe(s);
const leftoverOrgs = Number((await q("SELECT count(*)::int c FROM organizations WHERE slug LIKE 'h7-%'"))[0].c);
const leftoverEvents = Number((await q("SELECT count(*)::int c FROM outbox_events WHERE event_type LIKE 'H7\\_%'"))[0].c);
const cleanup = {
  NEW_ORGANIZATION_LEAK: leftoverOrgs,
  NEW_OUTBOX_LEAK: leftoverEvents,
  currentOutboxByStatus: await q("SELECT status, count(*)::int c FROM outbox_events GROUP BY status ORDER BY c DESC"),
  currentClaimable: Number((await q("SELECT count(*)::int c FROM outbox_events WHERE status IN ('PENDING','FAILED','PROCESSING') AND available_at <= now()"))[0].c),
  organizationsTotal: Number((await q("SELECT count(*)::int c FROM organizations"))[0].c),
};
writeFileSync(`${A}/07-cleanup.json`, JSON.stringify(cleanup, null, 2));
console.log(JSON.stringify(cleanup, null, 1));
await p.$disconnect();
