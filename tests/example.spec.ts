import { expect, test } from '@playwright/test';

test('Playwright can open a page in Chromium', async ({ page }) => {
  await page.goto('data:text/html,<title>TenderOS</title><h1>TenderOS</h1>');

  await expect(page).toHaveTitle('TenderOS');
  await expect(page.getByRole('heading', { name: 'TenderOS' })).toBeVisible();
});
