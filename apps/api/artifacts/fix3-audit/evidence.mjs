/** FIX-3 AUDIT — preuve runtime : quels eventTypes churnent réellement en base. Lecture seule. */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
const p = new PrismaClient();
const q = (s) => p.$queryRawUnsafe(s);

const byTypeStatus = await q(`
  SELECT event_type, status, count(*)::int c, max(attempt_count)::int max_attempts
  FROM outbox_events GROUP BY 1,2 ORDER BY c DESC`);
const deadLetter = await q(`
  SELECT event_type, count(*)::int c FROM dead_letter_events GROUP BY 1 ORDER BY c DESC`).catch(() => []);
const failedTypes = await q(`
  SELECT event_type, count(*)::int c, max(attempt_count)::int max_attempts, min(last_error) sample_error
  FROM outbox_events WHERE status IN ('FAILED','DEAD_LETTER') GROUP BY 1 ORDER BY c DESC`);
const publishedTypes = await q(`
  SELECT event_type, count(*)::int c FROM outbox_events WHERE status='PUBLISHED' GROUP BY 1 ORDER BY c DESC`);

const out = { generatedAt: new Date().toISOString(), byTypeStatus, deadLetter, failedTypes, publishedTypes };
writeFileSync("artifacts/fix3-audit/00-runtime-evidence.json", JSON.stringify(out, null, 2));

console.log("=== TYPES EN FAILED/DEAD_LETTER (churn reel) ===");
for (const r of failedTypes) console.log("  %s  %-40s attempts_max=%d  err=%s", String(r.c).padStart(4), r.event_type, r.max_attempts, (r.sample_error ?? "").slice(0, 60));
console.log("\n=== TYPES PUBLISHED (handler reel) ===");
for (const r of publishedTypes.slice(0, 15)) console.log("  %s  %s", String(r.c).padStart(4), r.event_type);
await p.$disconnect();
