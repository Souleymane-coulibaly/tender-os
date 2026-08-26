import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const BASE_URL = "https://tender-os-web.vercel.app";
const EMAIL = process.env.PLAYWRIGHT_STAGING_EMAIL;
const PASSWORD = process.env.PLAYWRIGHT_STAGING_PASSWORD;
const DOWNLOAD_DIR = process.env.PLAYWRIGHT_AUDIT_DOWNLOAD_DIR ?? path.resolve(process.cwd(), "..", "..", "staging-audit-downloads");

function requireCredentials(): { email: string; password: string } {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Missing PLAYWRIGHT_STAGING_EMAIL or PLAYWRIGHT_STAGING_PASSWORD.");
  }
  return { email: EMAIL, password: PASSWORD };
}

async function saveScreenshot(page: import("@playwright/test").Page, name: string): Promise<void> {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  await page.screenshot({ path: path.join(DOWNLOAD_DIR, `${name}.png`), fullPage: true });
}

async function login(page: import("@playwright/test").Page): Promise<void> {
  const credentials = requireCredentials();
  await page.goto(`${BASE_URL}/app/login`, { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Mot de passe").fill(credentials.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

test.describe.serial("Codex staging admin full audit", () => {
  test.use({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });

  test("connected admin walkthrough with screenshots and document extraction", async ({ page, context }) => {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    const anomalies: string[] = [];
    const serverErrors: string[] = [];
    const clientErrors: string[] = [];
    const downloadedFiles: string[] = [];

    page.on("pageerror", (error) => clientErrors.push(String(error)));
    page.on("console", (msg) => {
      if (msg.type() === "error") clientErrors.push(msg.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 500) {
        serverErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await login(page);
    await saveScreenshot(page, "01-after-login");

    if (!/\/app/.test(page.url())) {
      anomalies.push(`Login did not land on /app, current URL: ${page.url()}`);
    }

    await page.goto(`${BASE_URL}/app`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await saveScreenshot(page, "02-dashboard");
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (hasHorizontalOverflow) anomalies.push("Dashboard has horizontal overflow on desktop.");

    await page.goto(`${BASE_URL}/app/tenders`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await saveScreenshot(page, "03-tenders-list");

    const tenderOpenLinks = page.getByRole("link", { name: "Ouvrir" });
    const tenderCount = await tenderOpenLinks.count();
    if (tenderCount === 0) {
      anomalies.push("No tender visible in staging for end-to-end walkthrough.");
    } else {
      const tenderHref = await tenderOpenLinks.first().getAttribute("href");
      if (!tenderHref) {
        anomalies.push("First tender action link has no href.");
      } else {
        await page.goto(`${BASE_URL}${tenderHref}`, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle").catch(() => undefined);
      }
      await saveScreenshot(page, "04-tender-detail");

      const bodyText = await page.locator("body").innerText();
      for (const expected of ["DCE", "Analyse", "Checklist", "Livrables"]) {
        if (!bodyText.includes(expected)) anomalies.push(`Tender detail missing visible section: ${expected}`);
      }

      const currentUrl = page.url();
      const match = currentUrl.match(/\/app\/tenders\/([^/?#]+)/);
      const tenderId = match?.[1];
      if (!tenderId) {
        anomalies.push(`Unable to parse tender id from URL: ${currentUrl}`);
      } else {
        await page.goto(`${BASE_URL}/app/tenders/${tenderId}/deliverables`, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await saveScreenshot(page, "05-deliverables");

        const deliverableCandidates = [
          "DC1",
          "DC2",
          "DC4",
          "Mémoire technique",
          "Memoire technique",
          "Acte d'engagement",
          "DUME",
        ];

        for (const label of deliverableCandidates) {
          const locator = page.getByText(label, { exact: true }).first();
          if ((await locator.count()) > 0) {
            await locator.click().catch(() => undefined);
            await page.waitForLoadState("networkidle").catch(() => undefined);
            await saveScreenshot(page, `deliverable-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);

            const downloadButtons = [
              page.getByRole("button", { name: /Télécharger|Download|Exporter|Imprimer/i }).first(),
              page.getByRole("link", { name: /Télécharger|Download|Exporter|Imprimer/i }).first(),
            ];

            let downloaded = false;
            for (const candidate of downloadButtons) {
              if ((await candidate.count()) === 0) continue;
              try {
                const [download] = await Promise.all([
                  page.waitForEvent("download", { timeout: 5000 }),
                  candidate.click(),
                ]);
                const suggested = download.suggestedFilename();
                const target = path.join(DOWNLOAD_DIR, suggested);
                await download.saveAs(target);
                downloadedFiles.push(target);
                downloaded = true;
                break;
              } catch {
                // keep trying
              }
            }

            if (!downloaded) {
              anomalies.push(`No document download captured for deliverable: ${label}`);
            }

            await page.goto(`${BASE_URL}/app/tenders/${tenderId}/deliverables`, { waitUntil: "domcontentloaded" });
            await page.waitForLoadState("networkidle").catch(() => undefined);
          }
        }
      }
    }

    const report = {
      finishedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      finalUrl: page.url(),
      serverErrors,
      clientErrors,
      anomalies,
      downloadedFiles,
      pagesOpen: context.pages().length,
    };
    fs.writeFileSync(path.join(DOWNLOAD_DIR, "staging-audit-report.json"), JSON.stringify(report, null, 2), "utf8");

    expect.soft(serverErrors, "No server-side 5xx should occur during the walkthrough").toEqual([]);
  });
});
