import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const screenshotDir = path.resolve('test-results/screenshots');

test.beforeAll(() => {
  fs.mkdirSync(screenshotDir, { recursive: true });
});

test('welcome screen renders and captures desktop/mobile screenshots', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Cam\s*Gest/i })).toBeVisible();
  await expect(page.getByText(/Sicurezza connessa ad alta definizione/i)).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDir, `welcome-${testInfo.project.name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  expect(pageErrors, 'Uncaught JavaScript errors on welcome screen').toEqual([]);
});

test('camera mode opens and captures screenshot', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByText('Usa come fotocamera', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(screenshotDir, `camera-mode-${testInfo.project.name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  await expect(page.locator('#root')).not.toBeEmpty();
});

test('control center opens and captures screenshot', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByText('Usa come centro di controllo', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(screenshotDir, `control-center-${testInfo.project.name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  await expect(page.locator('#root')).not.toBeEmpty();
});
