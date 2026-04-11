const API_BASE = import.meta.env.VITE_API_URL || "";

const TOKEN_KEY = "access_token";
const REFRESH_KEY = "refresh_token";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function saveTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function tryRefresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(`${API_BASE}/api/web/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const data = await res.json();
    saveTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export async function apiFetch<T = any>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const doFetch = (token: string | null) =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string>),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  let res = await doFetch(getAccessToken());

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch(getAccessToken());
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API ${res.status}`);
  }
  return res.json();
}
