import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
const p = new PrismaClient();
const q = (s) => p.$queryRawUnsafe(s);
const byStatus = await q("SELECT status, count(*)::int c, count(*) FILTER (WHERE available_at <= now())::int claimable FROM outbox_events GROUP BY status ORDER BY c DESC");
const claimable = Number((await q("SELECT count(*)::int c FROM outbox_events WHERE status IN ('PENDING','FAILED','PROCESSING') AND available_at <= now()"))[0].c);
const out = { label: "H7_BASELINE", timestamp: new Date().toISOString(), outboxByStatus: byStatus, preExistingClaimable: claimable,
  totals: { outbox_events: Number((await q("SELECT count(*)::int c FROM outbox_events"))[0].c), organizations: Number((await q("SELECT count(*)::int c FROM organizations"))[0].c) } };
writeFileSync(process.argv[2] ?? "artifacts/h7-proof/00-baseline.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.outboxByStatus), "\nRECLAMABLE:", claimable);
await p.$disconnect();
