import type { GenerateRequest, GeneratedDraft, MapDetail, MapSummary, MindGraph } from "./types";

const API = "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}

function formatDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  // FastAPI request validation errors: [{ msg, loc, ... }]
  if (Array.isArray(detail)) {
    const messages = detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? String(d.msg).replace(/^Value error, /, "") : null))
      .filter(Boolean);
    return messages.length ? messages.join("; ") : null;
  }
  return null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new ApiError(0, "Can't reach the server. Check that the backend is running.");
  }
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      message = formatDetail((await res.json()).detail) ?? message;
    } catch {
      // Non-JSON error body; keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export function listMaps() {
  return request<MapSummary[]>("/api/maps");
}

export function getMap(id: string) {
  return request<MapDetail>(`/api/maps/${id}`);
}

export function createMap(title: string, graph?: MindGraph) {
  return request<MapDetail>("/api/maps", { method: "POST", body: JSON.stringify({ title, graph }) });
}

export function saveGraph(id: string, graph: MindGraph) {
  return request<MapDetail>(`/api/maps/${id}/graph`, { method: "PUT", body: JSON.stringify(graph) });
}

export function renameMap(id: string, title: string) {
  return request<MapSummary>(`/api/maps/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
}

export function duplicateMap(id: string) {
  return request<MapDetail>(`/api/maps/${id}/duplicate`, { method: "POST" });
}

export function deleteMap(id: string) {
  return request<{ message: string }>(`/api/maps/${id}`, { method: "DELETE" });
}

export function generateMap(body: GenerateRequest, signal: AbortSignal) {
  return request<GeneratedDraft>("/api/maps/generate", { method: "POST", body: JSON.stringify(body), signal });
}
