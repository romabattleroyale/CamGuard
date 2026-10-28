import { test, expect } from '@playwright/test';

test('homepage renders and captures screenshot', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /ogni giorno/i })).toBeVisible();
  await expect(page.getByText('La tua prossima', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('savora-home.png'), fullPage: true });
});

test('recipe search filters cards', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('textbox', { name: 'Cerca ricette' });
  await search.fill('tiramisù');
  await expect(page.getByRole('heading', { name: /tiramisù classico/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /bowl mediterranea/i })).toHaveCount(0);
});

test('recipe detail opens and portion control works', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /apri tiramisù classico/i }).click();
  const recipeDialog = page.getByRole('dialog', { name: /tiramisù classico/i });
  await expect(recipeDialog.getByRole('heading', { name: /tiramisù classico/i })).toBeVisible();
  await recipeDialog.getByRole('button', { name: 'Più porzioni' }).click();
  await expect(page.getByText('7 porzioni')).toBeVisible();
});

test('assistant drawer opens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /chiedi a savora/i }).click();
  await expect(page.getByText('Cosa prepariamo oggi?')).toBeVisible();
});

test('mobile layout is usable', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /ogni giorno/i })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('savora-mobile.png'), fullPage: true });
});
