import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = "https://tender-os-web.vercel.app";
const EMAIL = process.env.PLAYWRIGHT_STAGING_EMAIL;
const PASSWORD = process.env.PLAYWRIGHT_STAGING_PASSWORD;
const DOWNLOAD_DIR = process.env.PLAYWRIGHT_AUDIT_DOWNLOAD_DIR ?? path.resolve(process.cwd(), "staging-audit-downloads");

function requireCredentials(): { email: string; password: string } {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Missing PLAYWRIGHT_STAGING_EMAIL or PLAYWRIGHT_STAGING_PASSWORD.");
  }
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

async function tryClickAndDownload(page: import("@playwright/test").Page, trigger: import("@playwright/test").Locator, prefix: string): Promise<string | null> {
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10000 }),
      trigger.click(),
    ]);
    return await saveDownload(download, prefix);
  } catch {
    return null;
  }
}

test.describe.serial("Staging admin livrables export", () => {
  test.use({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });

  test("downloads what is really available from administrative dossier and technical memo", async ({ page }) => {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    const report: {
      tenderUrl?: string;
      administrativeUrl?: string;
      technicalMemoUrl?: string;
      downloads: string[];
      notes: string[];
      anomalies: string[];
    } = { downloads: [], notes: [], anomalies: [] };

    await login(page);

    await page.goto(`${BASE_URL}/app/tenders`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const openLinks = page.getByRole("link", { name: "Ouvrir" });
    const firstHref = await openLinks.first().getAttribute("href");
    expect(firstHref).toBeTruthy();
    const tenderUrl = `${BASE_URL}${firstHref}`;
    report.tenderUrl = tenderUrl;

    const tenderId = firstHref!.match(/\/app\/tenders\/([^/?#]+)/)?.[1];
    expect(tenderId).toBeTruthy();

    // Administrative dossier
    const administrativeUrl = `${BASE_URL}/app/tenders/${tenderId}/administrative-dossier`;
    report.administrativeUrl = administrativeUrl;
    await page.goto(administrativeUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const formBlocks = [
      { label: "DC1", card: page.getByText(/DC1/i).first() },
      { label: "DC2", card: page.getByText(/DC2/i).first() },
      { label: "DC4", card: page.getByText(/DC4/i).first() },
    ];

    for (const form of formBlocks) {
      if ((await form.card.count()) === 0) {
        report.notes.push(`${form.label}: not visible on page`);
        continue;
      }

      const generateButtons = page.getByRole("button", { name: "Générer le DOCX" });
      const generateCount = await generateButtons.count();
      if (generateCount > 0) {
        for (let i = 0; i < generateCount; i++) {
          const button = generateButtons.nth(i);
          try {
            await button.click({ timeout: 5000 });
            await page.waitForLoadState("networkidle").catch(() => undefined);
          } catch {
            // continue
          }
        }
      }

      const docxLinks = page.getByRole("link", { name: /Télécharger le DOCX|Télécharger/i });
      const linkCount = await docxLinks.count();
      let downloaded = 0;
      for (let i = 0; i < linkCount; i++) {
        const link = docxLinks.nth(i);
        const target = await tryClickAndDownload(page, link, form.label.toLowerCase());
        if (target) {
          report.downloads.push(target);
          downloaded += 1;
        }
      }
      if (downloaded === 0) report.notes.push(`${form.label}: no downloadable DOCX captured`);
    }

    // Technical memo
    const technicalMemoUrl = `${BASE_URL}/app/tenders/${tenderId}/technical-memo`;
    report.technicalMemoUrl = technicalMemoUrl;
    await page.goto(technicalMemoUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const createMemoButton = page.getByRole("button", { name: /Créer et analyser/i });
    if ((await createMemoButton.count()) > 0) {
      await createMemoButton.click().catch(() => undefined);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      report.notes.push("Technical memo creation attempted.");
    }

    const prepareButton = page.getByRole("button", { name: /Préparer le gabarit|Gabarit prêt/i }).first();
    if ((await prepareButton.count()) > 0) {
      await prepareButton.click().catch(() => undefined);
      await page.waitForLoadState("networkidle").catch(() => undefined);
    }

    const exportMemoButton = page.getByRole("button", { name: /Exporter le DOCX final/i }).first();
    if ((await exportMemoButton.count()) > 0) {
      const target = await tryClickAndDownload(page, exportMemoButton, "memoire-technique");
      if (target) {
        report.downloads.push(target);
      } else {
        report.notes.push("Technical memo export button present but no download captured.");
      }
    } else {
      report.notes.push("Technical memo export button not visible.");
    }

    fs.writeFileSync(path.join(DOWNLOAD_DIR, "staging-livrables-report.json"), JSON.stringify(report, null, 2), "utf8");
  });
});
