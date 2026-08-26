import { readFileSync } from "node:fs";
import { PrismaClient } from "/c/Users/couli/tender-os/node_modules/.pnpm/@prisma+client@6.19.3_prism_1d040ab5215f59f0e27ddee7f0cf082e/node_modules/@prisma/client/default.js";
const out = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const p = new PrismaClient();
const A = out.orgs.A.id;
console.log("abonnement Org A :", await p.organizationSubscription.findMany({ where: { organizationId: A }, select: { planTier: true, status: true, source: true } }));
console.log("membres actifs   :", await p.organizationMembership.count({ where: { organizationId: A } }));
console.log("organisation     :", await p.organization.findUnique({ where: { id: A }, select: { status: true, name: true } }));
await p.$disconnect();
