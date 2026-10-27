const SIGNALING_URL_KEY = 'camguard_signaling_server_url';

export function getSignalingBaseUrl(): string {
  try {
    const configured = window.localStorage.getItem(SIGNALING_URL_KEY)?.trim();
    if (configured) return configured.replace(/\/+$/, '');
  } catch {
    // Storage can be unavailable in privacy-restricted WebViews.
  }
  return window.location.origin.replace(/\/+$/, '');
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getSignalingBaseUrl()}${normalizedPath}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}
