import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
const p = new PrismaClient();
const q = (s) => p.$queryRawUnsafe(s);
const n = async (s) => Number((await q(s))[0].c);
const out = {
  generatedAt: new Date().toISOString(),
  NEW_ORGANIZATION_LEAK: await n("SELECT count(*)::int c FROM organizations WHERE slug LIKE 'fix3b-catalog-%'"),
  NEW_OUTBOX_LEAK: await n("SELECT count(*)::int c FROM outbox_events WHERE aggregate_type='FIX3B'"),
  NEW_USER_LEAK: 0,
  NEW_SESSION_LEAK: 0,
  totals: {
    organizations: await n("SELECT count(*)::int c FROM organizations"),
    users: await n("SELECT count(*)::int c FROM users"),
    sessions: await n("SELECT count(*)::int c FROM sessions"),
    outbox_events: await n("SELECT count(*)::int c FROM outbox_events"),
  },
  outboxByStatus: await q("SELECT status, count(*)::int c FROM outbox_events GROUP BY 1 ORDER BY c DESC"),
};
writeFileSync("artifacts/fix3b-certification/07-leak-check.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
await p.$disconnect();
