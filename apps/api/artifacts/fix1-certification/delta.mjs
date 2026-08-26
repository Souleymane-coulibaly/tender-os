/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-1 / H6 delta report.
 *
 * Compare deux snapshots par DIFFÉRENCE D'ENSEMBLES D'IDENTIFIANTS, jamais par soustraction de
 * compteurs : une fixture historique et une fixture nouvellement fuitée donneraient le même delta
 * numérique, mais pas le même ensemble d'ids. C'est ce qui rend la séparation HISTORICAL /
 * CREATED_DURING_RUN vérifiable par un auditeur (§14).
 *
 * Usage: node delta.mjs <before.json> <afterRun1.json> <afterRun2.json> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

const [beforePath, r1Path, r2Path, outPath] = process.argv.slice(2);
if (!outPath) {
  console.error("usage: node delta.mjs <before.json> <after1.json> <after2.json> <out.json>");
  process.exit(2);
}
const load = (f) => JSON.parse(readFileSync(f, "utf8"));
const before = load(beforePath);
const after1 = load(r1Path);
const after2 = load(r2Path);

/** Ressources présentes dans `after` ET absentes du snapshot de référence = créées puis NON nettoyées. */
function newlyLeaked(baseline, after, family) {
  const b = baseline.families[family];
  const a = after.families[family];
  const diff = (key) => a[key].filter((id) => !b[key].includes(id));
  const orgs = diff("organizationIds");
  return {
    organizations: orgs.length,
    organizationIds: orgs,
    users: diff("userIds").length,
    sessions: diff("sessionIds").length,
    // Les tables enfants sont scopées à l'organisation : si aucune organisation nouvelle ne
    // survit, aucune ligne enfant nouvelle ne peut survivre non plus (FK). Le delta de comptage
    // est néanmoins reporté pour transparence.
    childRowDelta: {
      outbox_events: a.counts.outbox_events - b.counts.outbox_events,
      audit_logs: a.counts.audit_logs - b.counts.audit_logs,
      documents: a.counts.documents - b.counts.documents,
      tenders: a.counts.tenders - b.counts.tenders,
      routing_decisions: a.counts.routing_decisions - b.counts.routing_decisions,
      client_accounts: a.counts.client_accounts - b.counts.client_accounts,
      organization_memberships: a.counts.organization_memberships - b.counts.organization_memberships,
    },
  };
}

const families = Object.keys(before.families);
const run1 = {};
const run2 = {};
for (const f of families) {
  run1[f] = newlyLeaked(before, after1, f);
  run2[f] = newlyLeaked(after1, after2, f);
}

const sum = (r, k) => Object.values(r).reduce((acc, v) => acc + v[k], 0);
const childSum = (r) =>
  Object.values(r).reduce((acc, v) => acc + Object.values(v.childRowDelta).reduce((a, n) => a + Math.max(0, n), 0), 0);

const report = {
  checkpoint: "TENDEROS-2.1-P2.3-E12.4-FIX-1-H6",
  generatedAt: new Date().toISOString(),
  environment: before.environment,
  historicalBaseline: {
    note: "Résidus présents AVANT RUN 1 — hors périmètre de FIX-1 (§14), aucune purge effectuée.",
    globalTotals: before.globalTotals,
    familyOrganizations: Object.fromEntries(families.map((f) => [f, before.families[f].counts.organizations])),
  },
  run1: {
    newLeakDelta: sum(run1, "organizations") + sum(run1, "users") + sum(run1, "sessions") + childSum(run1),
    newOrganizations: sum(run1, "organizations"),
    newUsers: sum(run1, "users"),
    newSessions: sum(run1, "sessions"),
    families: run1,
  },
  run2: {
    newLeakDelta: sum(run2, "organizations") + sum(run2, "users") + sum(run2, "sessions") + childSum(run2),
    newOrganizations: sum(run2, "organizations"),
    newUsers: sum(run2, "users"),
    newSessions: sum(run2, "sessions"),
    families: run2,
  },
  globalTotalsProgression: {
    before: before.globalTotals,
    afterRun1: after1.globalTotals,
    afterRun2: after2.globalTotals,
  },
};

writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log("NEW_LEAK_DELTA_RUN_1 =", report.run1.newLeakDelta);
console.log("NEW_LEAK_DELTA_RUN_2 =", report.run2.newLeakDelta);
