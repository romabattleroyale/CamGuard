const SIGNALING_URL_KEY = 'camguard_signaling_server_url';
const DEFAULT_SIGNALING_SERVER_URL = 'https://camguard-signaling.onrender.com';

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false;
  }
}

export function getSignalingBaseUrl(): string {
  try {
    const configured = window.localStorage.getItem(SIGNALING_URL_KEY)?.trim();
    if (configured) {
      // An Android WebView's localhost is the phone itself, not the hosted API.
      // Ignore old local values (notably https://localhost) that strand the APK.
      if (!isLoopbackUrl(configured)) return configured.replace(/\/+$/, '');
    }
  } catch {
    // Storage can be unavailable in privacy-restricted WebViews.
  }
  return DEFAULT_SIGNALING_SERVER_URL;
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getSignalingBaseUrl()}${normalizedPath}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}
