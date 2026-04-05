/**
 * Browser-side API client. Base URL comes only from NEXT_PUBLIC_API_BASE_URL
 * (localhost for dev, Render URL on Vercel — set per environment, never hardcode in code).
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let cachedBaseUrl: string | null = null;

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must use http or https");
  }
  if (parsed.pathname && parsed.pathname !== "/") {
    console.warn(
      "[api] NEXT_PUBLIC_API_BASE_URL should be origin only (no path); using origin:",
      parsed.origin
    );
  }
  return parsed.origin;
}

/**
 * Resolved API origin (no trailing slash). Throws if env is missing or invalid.
 */
export function getApiBaseUrl(): string {
  if (cachedBaseUrl !== null) {
    return cachedBaseUrl;
  }
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!raw) {
    console.error(
      "[api] NEXT_PUBLIC_API_BASE_URL is missing; set it in .env.local or Vercel Environment Variables."
    );
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  }
  cachedBaseUrl = normalizeBaseUrl(raw);
  if (process.env.NODE_ENV === "development") {
    console.debug("[api] resolved NEXT_PUBLIC_API_BASE_URL ->", cachedBaseUrl);
  }
  return cachedBaseUrl;
}

function buildUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

async function parseErrorBody(res: Response): Promise<{ message: string; code?: string; raw: unknown }> {
  const text = await res.text();
  if (!text) {
    return { message: res.statusText || `HTTP ${res.status}`, raw: null };
  }
  try {
    const data = JSON.parse(text) as { detail?: string; code?: string };
    const message =
      typeof data.detail === "string" ? data.detail : text.slice(0, 200);
    return { message, code: typeof data.code === "string" ? data.code : undefined, raw: data };
  } catch {
    return { message: text.slice(0, 200), raw: text };
  }
}

export type DoctorListItem = {
  id: string;
  name: string;
  specialty: string;
};

export type AppointmentCreateResponse = {
  status: string;
  appointment_id: string;
  /** Doctor's stable id for Novu (from Mongo); null if missing on doctor document. */
  doctor_user_id?: string | null;
};

export type AppointmentCreatePayload = {
  patient_id: string;
  doctor_id: string;
  appointment_time: string;
};

export async function getJson<T>(path: string): Promise<T> {
  const url = buildUrl(path);
  if (process.env.NODE_ENV === "development") {
    console.debug("[api] GET", url);
  }
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (process.env.NODE_ENV === "development") {
    console.debug("[api] GET", path, "->", res.status);
  }
  if (!res.ok) {
    const { message, code, raw } = await parseErrorBody(res);
    console.error("[api] GET failed", path, res.status, message);
    throw new ApiError(message, res.status, code, raw);
  }
  return res.json() as Promise<T>;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = buildUrl(path);
  if (process.env.NODE_ENV === "development") {
    console.debug("[api] POST", url);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (process.env.NODE_ENV === "development") {
    console.debug("[api] POST", path, "->", res.status);
  }
  if (!res.ok) {
    const { message, code, raw } = await parseErrorBody(res);
    console.error("[api] POST failed", path, res.status, message);
    throw new ApiError(message, res.status, code, raw);
  }
  return res.json() as Promise<T>;
}

/** Task 1: list doctors for booking UI. */
export function fetchDoctors(): Promise<DoctorListItem[]> {
  return getJson<DoctorListItem[]>("/api/v1/doctors/");
}

/** Existing backend contract — unchanged. */
export function createAppointment(
  payload: AppointmentCreatePayload
): Promise<AppointmentCreateResponse> {
  return postJson<AppointmentCreateResponse>("/api/v1/appointments/", payload);
}

export type HealthResponse = {
  status: string;
  version?: string;
};

export function fetchHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>("/health");
}
