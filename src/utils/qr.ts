import QRCode from 'qrcode';

/**
 * Generates a standards-compatible QR code for pairing links.
 * Keep dark modules on a white background: many Android camera scanners
 * struggle with inverted (white-on-dark) QR codes, especially on dim screens.
 */
export async function generateQrDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: 420,
      margin: 4,
      color: {
        dark: '#07111f',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'Q',
    });
  } catch (err) {
    console.error('Failed to generate QR code', err);
    return '';
  }
}
