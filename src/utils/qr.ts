import QRCode from 'qrcode';

/**
 * Generates a Data URL for a given text as a high quality QR code
 */
export async function generateQrDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: 320,
      margin: 2,
      color: {
        dark: '#ffffff',
        light: '#0a0f1d',
      },
      errorCorrectionLevel: 'M',
    });
  } catch (err) {
    console.error('Failed to generate QR code', err);
    return '';
  }
}
