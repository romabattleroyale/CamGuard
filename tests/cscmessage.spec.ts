import { test, expect } from '@playwright/test';

test('CsCMessage inbox renders and captures desktop screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page).toHaveTitle(/CsCMessage/);
  await expect(page.getByRole('heading', { name: /Le connessioni/i })).toBeVisible();
  await expect(page.getByText('Sofia Rossi')).toBeVisible();
  await expect(page.getByText('Anteprima locale')).toBeVisible();
  await expect(page.getByText('Messaggi demo, non inviati')).toBeVisible();
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
  await page.getByRole('button', { name: /Reagisci a: Ciao da Playwright/i }).click();
  await expect(page.getByText('❤️')).toBeVisible();
  await page.getByRole('button', { name: /Rispondi a: Ciao da Playwright/i }).click();
  await expect(page.getByText('Risposta a')).toBeVisible();
  await page.getByPlaceholder(/Scrivi un messaggio/i).fill('Ricevuto!');
  await page.getByRole('button', { name: /Invia messaggio/i }).click();
  await expect(page.getByText('Ciao da Playwright').last()).toBeVisible();
  await expect(page.getByText('Ricevuto!')).toBeVisible();
  await expect(page.getByText('Ricevuto!')).toBeInViewport();
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({name:'manuale.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 demo')});
  await expect(page.getByText(/manuale.pdf/)).toBeVisible();
  await expect(page.getByText(/Pronto per l’invio/)).toBeVisible();
  await page.getByRole('button', { name: /Rimuovi allegato/i }).click();

  await fileInput.setInputFiles({name:'script.exe',mimeType:'application/octet-stream',buffer:Buffer.from('not allowed')});
  await expect(page.getByText(/Formato non supportato/i)).toBeVisible();
  await expect(page.locator('.attachment-preview')).toHaveCount(0);

  await fileInput.setInputFiles({name:'troppo-grande.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(10*1024*1024+1)});
  await expect(page.getByText(/supera il limite di 10 MB/i)).toBeVisible();
  await expect(page.locator('.attachment-preview')).toHaveCount(0);

  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 360;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 640, 360);
    gradient.addColorStop(0, '#168dff'); gradient.addColorStop(1, '#7659ed');
    context.fillStyle = gradient; context.fillRect(0, 0, 640, 360);
    context.fillStyle = '#ffffff'; context.font = 'bold 34px sans-serif';
    context.fillText('CsCMessage · Foto di prova', 32, 190);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await fileInput.setInputFiles({name:'foto-chat.png',mimeType:'image/png',buffer:Buffer.from(imageBase64,'base64')});
  await expect(page.getByAltText('Anteprima allegato')).toBeVisible();
  await expect(page.getByAltText('Anteprima allegato')).toHaveJSProperty('naturalWidth', 640);
  await expect(page.getByText(/Pronto per l’invio/)).toBeVisible();
  await page.getByRole('button', { name: /Invia messaggio/i }).click();
  await expect(page.getByAltText('foto-chat.png')).toBeVisible();
  await expect(page.getByAltText('foto-chat.png')).toHaveJSProperty('naturalWidth', 640);
  await expect(page.locator('.toast')).toBeHidden();
  await page.screenshot({ path: 'test-results/cscmessage-mobile-chat.png', fullPage: true });
});

test('CsC AI opens as an explicit opt-in preview', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'CsC AI preview is currently presented in the desktop inbox only.');
  await page.goto('/');
  await page.getByRole('button', { name: /Apri CsC AI/i }).click();
  await expect(page.getByRole('heading', { name: /Chiedi a CsC AI/i })).toBeVisible();
});


test('compact Android layout keeps navigation and composer usable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.locator('.mobile-bottom')).toBeVisible();
  await expect(page.locator('.mobile-bottom button')).toHaveCount(5);
  const noHorizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth
  );
  expect(noHorizontalOverflow).toBeTruthy();

  await page.getByRole('button', { name: /Sofia Rossi/i }).click();
  await expect(page.getByPlaceholder(/Scrivi un messaggio/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Invia messaggio/i })).toBeInViewport();
  const conversationOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth
  );
  expect(conversationOverflow).toBeTruthy();

  await page.screenshot({ path: 'test-results/cscmessage-android-compact.png', fullPage: true });
});
