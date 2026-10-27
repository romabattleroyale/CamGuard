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
  await expect(page.getByText('FOTOCAMERA ATTIVA', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /La tua casa, sotto controllo/i })).toBeVisible();
  await expect(page.getByText('Collega una telecamera telefono')).toBeVisible();
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

test('signaling join rejects an incorrect PIN and accepts the valid PIN', async ({ request }) => {
  const created = await request.post('/api/signaling/create', {
    data: { name: 'Playwright PIN test' },
  });
  expect(created.ok()).toBeTruthy();
  const session = await created.json();
  expect(session.sessionId).toBeTruthy();
  expect(session.pin).toMatch(/^\d{6}$/);

  const rejected = await request.post('/api/signaling/join', {
    data: { sessionId: session.sessionId, pin: '000000', cameraInfo: {} },
  });
  expect(rejected.status()).toBe(403);

  const joined = await request.post('/api/signaling/join', {
    data: { sessionId: session.sessionId, pin: session.pin, cameraInfo: { resolution: '1280x720' } },
  });
  expect(joined.ok()).toBeTruthy();
  expect((await joined.json()).success).toBe(true);
});
