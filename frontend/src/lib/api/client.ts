import { logger } from "@/lib/logger";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiClientError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function resolveApiBaseUrl(): string {
  const configured = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (import.meta.env.PROD) {
    throw new Error("VITE_API_BASE_URL is required for production builds.");
  }

  return "http://localhost:8000";
}

export const API_BASE_URL = resolveApiBaseUrl();

function getAuthToken(): string | null {
  if (typeof window !== "undefined" && import.meta.env.VITE_API_TOKEN) {
    return String(import.meta.env.VITE_API_TOKEN);
  }

  return null;
}

export async function request<T>(path: string, method: HttpMethod = "GET", body?: unknown): Promise<T> {
  const headers = new Headers();
  headers.set("Accept", "application/json");

  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  logger.debug("api.request", { method, path, hasBody: body !== undefined, hasAuthToken: Boolean(token) });

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: payload,
  });

  const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const durationMs = Math.round((endedAt - startedAt) * 100) / 100;

  if (!response.ok) {
    let details: unknown;
    try {
      details = await response.json();
    } catch {
      details = undefined;
    }
    logger.error("api.response.error", { method, path, status: response.status, durationMs, details });
    throw new ApiClientError(`Request failed with status ${response.status}`, response.status, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json()) as T;
  logger.debug("api.response.ok", { method, path, status: response.status, durationMs });
  return data;
}
