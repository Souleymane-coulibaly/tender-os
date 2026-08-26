/**
 * H7 PROOF §13 — amorce/retire un backlog Outbox ÉTRANGER contrôlé, pour comparer une suite réelle
 * à froid et sous backlog. Crée sa propre organisation jetable : aucune donnée existante n'est
 * touchée, aucun résidu historique n'est purgé.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const ORG = "11111111-1111-4111-8111-111111111111";
const p = new PrismaClient();
const mode = process.argv[2];
const n = Number(process.argv[3] ?? 500);

if (mode === "seed") {
  await p.$executeRawUnsafe(
    `INSERT INTO organizations (id,name,slug,default_timezone,status,created_at,updated_at)
     VALUES ('${ORG}'::uuid,'H7 Backlog Org','h7-backlog-org','Europe/Paris','TRIAL',now(),now())
     ON CONFLICT (id) DO NOTHING`,
  );
  const vals = Array.from(
    { length: n },
    () =>
      `('${randomUUID()}'::uuid,'${ORG}'::uuid,'H7_BACKLOG_EVENT',1,'H7','${randomUUID()}'::uuid,'{}'::jsonb,` +
      ` now()-interval '2 hours','PENDING',0, now()-interval '2 hours', now()-interval '2 hours')`,
  );
  await p.$executeRawUnsafe(
    `INSERT INTO outbox_events (id,organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at,status,attempt_count,available_at,created_at) VALUES ${vals.join(",")}`,
  );
  console.log("seeded:", n);
} else if (mode === "clean") {
  const deleted = await p.$executeRawUnsafe(`DELETE FROM outbox_events WHERE organization_id='${ORG}'::uuid`);
  await p.$executeRawUnsafe(`DELETE FROM organizations WHERE id='${ORG}'::uuid`);
  console.log("cleaned outbox rows:", deleted);
}

console.log(
  "claimable now:",
  (await p.$queryRawUnsafe("SELECT count(*)::int c FROM outbox_events WHERE status IN ('PENDING','FAILED','PROCESSING') AND available_at <= now()"))[0].c,
);
await p.$disconnect();
