const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
(async () => {
  const p = new PrismaClient();
  const baselinePath = "C:/Users/couli/tender-os/apps/api/artifacts/fix2a-certification/00-baseline.json";
  const current = {
    capturedAt: new Date().toISOString(),
    organizations: await p.organization.count(),
    users: await p.user.count(),
    sessions: await p.session.count(),
    outboxEvents: await p.outboxEvent.count(),
  };
  if (!fs.existsSync(baselinePath)) {
    fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2));
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const out = {
    baseline,
    current,
    delta: {
      organizations: current.organizations - baseline.organizations,
      users: current.users - baseline.users,
      sessions: current.sessions - baseline.sessions,
      outboxEvents: current.outboxEvents - baseline.outboxEvents,
    },
  };
  fs.writeFileSync("C:/Users/couli/tender-os/apps/api/artifacts/fix2a-certification/05-leak-check.json", JSON.stringify(out, null, 2));
  await p.$disconnect();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
