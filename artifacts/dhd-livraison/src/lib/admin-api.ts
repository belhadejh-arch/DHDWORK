import { API_BASE } from './api-base';

export class AdminApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export async function adminFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 15_000,
  allowedStatuses: number[] = [],
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const token = localStorage.getItem('dhd_admin_token');
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
      signal: options.signal ?? controller.signal,
    });
    const text = response.status === 204 ? '' : await response.text();
    let data: unknown = null;
    if (text.trim()) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      const message = typeof data === 'object' && data && 'error' in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${response.status}`;
      throw new AdminApiError(response.status, message);
    }
    return data as T;
  } finally {
    window.clearTimeout(timeout);
  }
}