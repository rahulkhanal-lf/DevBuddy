const API = "http://localhost:8000";

function getToken(): string | null {
  try { return localStorage.getItem("mindflow_token"); } catch { return null; }
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra };
}

export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(`${API}${path}`, { ...init, headers });
}
