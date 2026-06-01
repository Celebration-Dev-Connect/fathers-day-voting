import type {
  JudgeBallot,
  JudgeCategorySummary,
  JudgeSession,
  Registration,
  StaffUser,
} from "@carshow/carshow-components";
import { API_URL } from "./config";

const tokenKey = "carshow-judge-token";

export function getToken() {
  return window.localStorage.getItem(tokenKey);
}

export function setToken(token: string) {
  window.localStorage.setItem(tokenKey, token);
}

export function clearToken() {
  window.localStorage.removeItem(tokenKey);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? body.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function devLogin(email: string) {
  return request<{ token: string; staff: StaffUser }>("/auth/dev-login", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function me() {
  return request<{ staff: StaffUser }>("/auth/me");
}

export async function getJudgeSession() {
  return request<JudgeSession>("/judging/session");
}

export async function listJudgeCategories() {
  return request<{ categories: JudgeCategorySummary[] }>("/judging/categories");
}

export async function listJudgeVehicles(categoryId: string) {
  return request<{ registrations: Registration[] }>(`/judging/categories/${categoryId}/vehicles`);
}

export async function getJudgeBallot(categoryId: string) {
  return request<JudgeBallot>(`/judging/categories/${categoryId}/ballot`);
}

export async function saveJudgeBallot(categoryId: string, picks: Array<{ vehicleEntryId: string; rank: number }>) {
  return request<JudgeBallot>(`/judging/categories/${categoryId}/ballot`, {
    method: "PUT",
    body: JSON.stringify({ picks }),
  });
}

export async function uploadRegistrationPhoto(registrationId: string, file: File) {
  const token = getToken();
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${API_URL}/registrations/${encodeURIComponent(registrationId)}/photos`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

  if (!response.ok) {
    const responseBody = await response.json().catch(() => ({}));
    throw new Error(responseBody.message ?? responseBody.error ?? `Upload failed with ${response.status}`);
  }

  return response.json() as Promise<{ id: string; status: "PENDING" }>;
}
