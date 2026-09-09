import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { login, readFixture } from "./fixtures";
const prisma = new PrismaClient();

test("A — section Tender au tout premier chargement apres seed", async ({ page }) => {
  const f = readFixture();
  await prisma.tender.update({ where: { id: f.tenderId }, data: { candidateCompanyId: f.candidateCompanyId } });
  console.log("EXPECT_HREF=/app/candidate-companies/" + f.candidateCompanyId);
  await login(page, f);
  const resp = await page.goto(`/app/tenders/${f.tenderId}`);
  console.log("STATUS=" + resp?.status());
  const sec = page.locator("section").filter({ hasText: "Entreprise candidate" }).first();
  console.log("SECTION=" + (await sec.innerHTML()).replace(/\s+/g, " ").slice(0, 400));
  await prisma.$disconnect();
  expect(true).toBe(true);
});

test("B — quel element deborde a 1024 quand le selecteur est ouvert", async ({ page }) => {
  const f = readFixture();
  await login(page, f);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(`/app/tenders/${f.tenderId}`);
  console.log("OVF_BEFORE_1024=" + (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)));
  const s = page.locator("section").filter({ hasText: "Entreprise candidate" }).first();
  await s.getByRole("button", { name: "Changer d'entreprise candidate" }).click();
  await page.getByLabel("Nouvelle entreprise candidate").waitFor();
  console.log("OVF_AFTER_1024=" + (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)));
  const info = await page.evaluate(() => {
    const lim = document.documentElement.clientWidth;
    const out: string[] = [];
    document.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > lim + 1) out.push(`${el.tagName}[${(el.getAttribute("class") || "").slice(0, 55)}] right=${Math.round(r.right)} w=${Math.round(r.width)}`);
    });
    return out.slice(0, 10);
  });
  console.log("OUT_OF_BOUNDS=" + JSON.stringify(info, null, 1));
  expect(true).toBe(true);
});
