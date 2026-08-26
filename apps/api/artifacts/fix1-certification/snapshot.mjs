/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-1 / H6 certification snapshot.
 *
 * Capture l'ÉTAT COMPLET des fixtures appartenant aux sept suites corrigées, identifiées par leur
 * préfixe de slug d'organisation (donnée de test démontrable — jamais une purge, jamais un compteur
 * global seul, §2/§7). Enregistre les IDENTIFIANTS et pas seulement des compteurs : c'est ce qui
 * permet de séparer sans ambiguïté les résidus HISTORIQUES des ressources CRÉÉES PENDANT un run
 * (§14) — un delta de compteurs ne le permettrait pas.
 *
 * N'écrit RIEN en base. Lecture seule.
 *
 * Usage: node snapshot.mjs <label> <fichier-de-sortie.json>
 */
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const FAMILIES = {
  "pricing-schedule": ["chiffrage-org-a-http-", "chiffrage-org-b-http-"],
  "response-package": ["package-org-a-http-", "package-org-b-http-"],
  analysis: ["analysis-org-a-http-", "analysis-org-b-http-"],
  extraction: ["extraction-org-a-http-", "extraction-org-b-http-", "extraction-org-none-"],
  connectors: ["org-a-connectors-", "org-b-connectors-"],
  submission: ["submission-org-a-http-", "submission-org-b-http-"],
};

const CHILD_TABLES = [
  ["outbox_events", "organization_id"],
  ["audit_logs", "organization_id"],
  ["documents", "organization_id"],
  ["tenders", "organization_id"],
  ["routing_decisions", "organization_id"],
  ["client_accounts", "organization_id"],
  ["organization_memberships", "organization_id"],
];

const label = process.argv[2] ?? "SNAPSHOT";
const outFile = process.argv[3];
if (!outFile) {
  console.error("usage: node snapshot.mjs <label> <out.json>");
  process.exit(2);
}

const p = new PrismaClient();
const q = (s) => p.$queryRawUnsafe(s);
const sh = (c) => {
  try {
    return execSync(c, { encoding: "utf8" }).trim();
  } catch {
    return "n/a";
  }
};

const families = {};
for (const [family, prefixes] of Object.entries(FAMILIES)) {
  const where = prefixes.map((x) => `slug LIKE '${x}%'`).join(" OR ");
  const orgs = await q(`SELECT id, slug, created_at FROM organizations WHERE ${where} ORDER BY created_at`);
  const ids = orgs.map((o) => `'${o.id}'::uuid`).join(",");

  const children = {};
  for (const [table, col] of CHILD_TABLES) {
    children[table] = ids ? Number((await q(`SELECT count(*)::int c FROM ${table} WHERE ${col} IN (${ids})`))[0].c) : 0;
  }
  // Utilisateurs/sessions ne portent PAS d'organizationId : ils sont rattachés via les memberships.
  const users = ids
    ? await q(`SELECT DISTINCT u.id FROM users u JOIN organization_memberships m ON m.user_id = u.id WHERE m.organization_id IN (${ids})`)
    : [];
  const sessions = ids
    ? await q(`SELECT DISTINCT s.id FROM sessions s JOIN organization_memberships m ON m.user_id = s.user_id WHERE m.organization_id IN (${ids})`)
    : [];

  families[family] = {
    organizationIds: orgs.map((o) => o.id),
    organizationSlugs: orgs.map((o) => o.slug),
    userIds: users.map((u) => u.id),
    sessionIds: sessions.map((s) => s.id),
    counts: { organizations: orgs.length, users: users.length, sessions: sessions.length, ...children },
  };
}

const snapshot = {
  label,
  timestamp: new Date().toISOString(),
  environment: {
    branch: sh("git branch --show-current"),
    head: sh("git rev-parse HEAD"),
    node: process.version,
    pnpm: sh("pnpm -v").split("\n").pop(),
    postgres: (await q("SHOW server_version"))[0].server_version,
  },
  globalTotals: {
    organizations: Number((await q("SELECT count(*)::int c FROM organizations"))[0].c),
    users: Number((await q("SELECT count(*)::int c FROM users"))[0].c),
    sessions: Number((await q("SELECT count(*)::int c FROM sessions"))[0].c),
    tenders: Number((await q("SELECT count(*)::int c FROM tenders"))[0].c),
    outbox_events: Number((await q("SELECT count(*)::int c FROM outbox_events"))[0].c),
    audit_logs: Number((await q("SELECT count(*)::int c FROM audit_logs"))[0].c),
  },
  families,
};

writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
console.log(`${label} -> ${outFile} | orgs(familles)=${Object.values(families).reduce((a, f) => a + f.counts.organizations, 0)} | orgs(global)=${snapshot.globalTotals.organizations}`);
await p.$disconnect();
