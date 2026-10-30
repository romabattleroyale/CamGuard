import { test, expect } from '@playwright/test';

test('CsCMessage inbox renders and captures desktop screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page).toHaveTitle(/CsCMessage/);
  await expect(page.getByRole('heading', { name: /Le connessioni/i })).toBeVisible();
  await expect(page.getByText('Sofia Rossi')).toBeVisible();
  await page.screenshot({ path: 'test-results/cscmessage-desktop.png', fullPage: true });
});

test('mobile navigation, search and conversation composer work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Chat/i }).last()).toBeVisible();
  await page.getByPlaceholder(/Cerca persone/i).fill('Sofia');
  await expect(page.getByText('Sofia Rossi')).toBeVisible();
  await expect(page.getByText('Gruppo Viaggio')).toHaveCount(0);
  await page.getByRole('button', { name: /Sofia Rossi/i }).click();
  await expect(page.getByPlaceholder(/Scrivi un messaggio/i)).toBeVisible();
  await page.getByPlaceholder(/Scrivi un messaggio/i).fill('Ciao da Playwright');
  await page.getByRole('button', { name: /Invia messaggio/i }).click();
  await expect(page.getByText('Ciao da Playwright')).toBeVisible();
  await page.screenshot({ path: 'test-results/cscmessage-mobile-chat.png', fullPage: true });
});

test('CsC AI opens as an explicit opt-in preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Apri CsC AI/i }).click();
  await expect(page.getByRole('heading', { name: /Chiedi a CsC AI/i })).toBeVisible();
});
