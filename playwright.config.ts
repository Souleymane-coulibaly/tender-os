import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Correctif audit Codex P2-003 — un seul worker : les specs partagent le même livrable
  // Mémoire technique seedé (verrou optimiste réel, jamais une simulation), une exécution
  // concurrente romprait cette hypothèse.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  globalSetup: './tests/global-setup.ts',
  // V2 Sprint 1 §5 — nettoyage reproductible : supprime les organisations seedées après la suite.
  globalTeardown: './tests/global-teardown.ts',
  // Next.js en mode dev compile chaque route à la demande (premier accès plus lent) — délai
  // généreux plutôt qu'un flake sur la toute première navigation vers une route dynamique.
  expect: { timeout: 15000 },
  timeout: 60000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    navigationTimeout: 20000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
