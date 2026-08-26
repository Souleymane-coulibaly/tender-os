import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = "https://tender-os-web.vercel.app";
const EMAIL = process.env.PLAYWRIGHT_STAGING_EMAIL;
const PASSWORD = process.env.PLAYWRIGHT_STAGING_PASSWORD;
const DOWNLOAD_DIR = process.env.PLAYWRIGHT_AUDIT_DOWNLOAD_DIR ?? path.resolve(process.cwd(), "staging-audit-downloads");

function requireCredentials(): { email: string; password: string } {
  if (!EMAIL || !PASSWORD) throw new Error("Missing PLAYWRIGHT_STAGING_EMAIL or PLAYWRIGHT_STAGING_PASSWORD.");
  return { email: EMAIL, password: PASSWORD };
}

async function login(page: import("@playwright/test").Page): Promise<void> {
  const credentials = requireCredentials();
  await page.goto(`${BASE_URL}/app/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Mot de passe").fill(credentials.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function saveDownload(download: import("@playwright/test").Download, prefix: string): Promise<string> {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const fileName = `${prefix}-${download.suggestedFilename().replace(/[<>:\"/\\\\|?*]+/g, "_")}`;
  const target = path.join(DOWNLOAD_DIR, fileName);
  await download.saveAs(target);
  return target;
}

async function tryDownloadFromLocator(page: import("@playwright/test").Page, locator: import("@playwright/test").Locator, prefix: string): Promise<string | null> {
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10000 }),
      locator.click(),
    ]);
    return await saveDownload(download, prefix);
  } catch {
    return null;
  }
}

test.describe.serial("Staging admin livrables export on tender 'test'", () => {
  test.use({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });

  test("opens tender 'test' and downloads what is actually available", async ({ page }) => {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    const report: Record<string, unknown> = {
      tenderObject: "test",
      downloads: [] as string[],
      notes: [] as string[],
      anomalies: [] as string[],
    };

    await login(page);
    await page.goto(`${BASE_URL}/app/tenders`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const targetRow = page.locator("table tbody tr", { has: page.getByRole("cell", { name: "test", exact: true }) }).first();
    await expect(targetRow).toBeVisible();
    const openLink = targetRow.getByRole("link", { name: "Ouvrir" });
    const href = await openLink.getAttribute("href");
    expect(href).toBeTruthy();
    const tenderUrl = `${BASE_URL}${href}`;
    Object.assign(report, { tenderUrl });

    const tenderId = href!.match(/\/app\/tenders\/([^/?#]+)/)?.[1];
    expect(tenderId).toBeTruthy();

    const pagesToVisit = {
      overview: `${BASE_URL}/app/tenders/${tenderId}`,
      dce: `${BASE_URL}/app/tenders/${tenderId}/dce`,
      analysis: `${BASE_URL}/app/tenders/${tenderId}/analysis`,
      checklist: `${BASE_URL}/app/tenders/${tenderId}/checklist`,
      deliverables: `${BASE_URL}/app/tenders/${tenderId}/deliverables`,
      administrative: `${BASE_URL}/app/tenders/${tenderId}/administrative-dossier`,
      technicalMemo: `${BASE_URL}/app/tenders/${tenderId}/technical-memo`,
    };
    Object.assign(report, pagesToVisit);

    for (const url of Object.values(pagesToVisit)) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => undefined);
    }

    // Administrative dossier downloads
    await page.goto(pagesToVisit.administrative, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const adminDownloadLinks = page.getByRole("link", { name: /Télécharger le DOCX|Télécharger le brouillon XML|PDF généré — télécharger|Télécharger/i });
    const adminDownloadCount = await adminDownloadLinks.count();
    for (let i = 0; i < adminDownloadCount; i++) {
      const downloaded = await tryDownloadFromLocator(page, adminDownloadLinks.nth(i), `test-admin-${i + 1}`);
      if (downloaded) (report.downloads as string[]).push(downloaded);
    }
    if ((report.downloads as string[]).length === 0) {
      (report.notes as string[]).push("No administrative document download exposed on tender 'test'.");
    }

    // Technical memo downloads
    await page.goto(pagesToVisit.technicalMemo, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const exportMemoButton = page.getByRole("button", { name: /Exporter le DOCX final/i }).first();
    if ((await exportMemoButton.count()) > 0) {
      const memoDownload = await tryDownloadFromLocator(page, exportMemoButton, "test-memo");
      if (memoDownload) {
        (report.downloads as string[]).push(memoDownload);
      } else {
        (report.notes as string[]).push("Technical memo export button present but no download captured.");
      }
    } else {
      (report.notes as string[]).push("Technical memo export button not visible on tender 'test'.");
    }

    // Response package / submission package if available
    await page.goto(pagesToVisit.deliverables, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const zipLinks = page.getByRole("link", { name: /Télécharger le ZIP/i });
    const zipCount = await zipLinks.count();
    for (let i = 0; i < zipCount; i++) {
      const downloaded = await tryDownloadFromLocator(page, zipLinks.nth(i), `test-zip-${i + 1}`);
      if (downloaded) (report.downloads as string[]).push(downloaded);
    }

    fs.writeFileSync(path.join(DOWNLOAD_DIR, "staging-livrables-test-tender-report.json"), JSON.stringify(report, null, 2), "utf8");
  });
});
