// Lightweight fetch client for employee portal endpoints (/api/employee/*).
// API_BASE reads VITE_API_URL so it works on Vercel → Render cross-origin deployments.
import { API_BASE } from '@/lib/api-base';

export function getEmployeeToken(): string | null {
  return localStorage.getItem("employee_token");
}
export function setEmployeeToken(token: string | null): void {
  if (token) localStorage.setItem("employee_token", token);
  else localStorage.removeItem("employee_token");
}

export class EmpApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export async function empFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getEmployeeToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.error === "string") code = data.error;
    } catch { /* ignore */ }
    throw new EmpApiError(res.status, code);
  }
  if (res.status === 204) return null as T;
  const text = await res.text();
  if (!text.trim()) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new EmpApiError(res.status, 'invalid_json_response');
  }
}
