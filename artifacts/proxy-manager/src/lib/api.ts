const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

const TOKEN_KEY = "proxy_mgr_session";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}${p}`;
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const res = await fetch(apiUrl(path), {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(init.headers || {}),
    },
    ...init,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const msg =
      (data as { error?: string } | null)?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}
