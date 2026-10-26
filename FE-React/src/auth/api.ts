const API = "http://localhost:8000";

interface AuthResponse {
  token: string;
  user: { id: string; name: string; email: string };
}

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "Request failed";
    throw new Error(detail);
  }
  return data as T;
}

export function register(name: string, email: string, password: string) {
  return post<AuthResponse>("/api/auth/register", { name, email, password });
}

export function loginApi(email: string, password: string) {
  return post<AuthResponse>("/api/auth/login", { email, password });
}

export async function getMe(token: string) {
  const res = await fetch(`${API}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json() as Promise<{ id: string; name: string; email: string }>;
}
