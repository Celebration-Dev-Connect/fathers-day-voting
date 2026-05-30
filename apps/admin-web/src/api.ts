import type {
  AuditLog,
  Category,
  CategoryVotingTally,
  QrCard,
  Registration,
  RegistrationPayload,
  StaffUser,
  VotingSettings,
} from "./types";
import { API_URL } from "./config";

const tokenKey = "carshow-admin-token";

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

export async function listCategories() {
  return request<{ categories: Category[] }>("/categories");
}

export async function createCategory(name: string) {
  return request<{ category: Category }>("/categories", {
    method: "POST",
    body: JSON.stringify({ name, active: true }),
  });
}

export async function updateCategory(id: string, input: Partial<Pick<Category, "name" | "active">>) {
  return request<{ category: Category }>(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function listRegistrations(search = "") {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  return request<{ registrations: Registration[] }>(`/registrations?${params.toString()}`);
}

export async function createRegistration(payload: RegistrationPayload) {
  return request<{ registration: Registration }>("/registrations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateRegistration(id: string, payload: RegistrationPayload) {
  return request<{ registration: Registration }>(`/registrations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function checkInRegistration(id: string) {
  return request<{ registration: Registration }>(`/registrations/${id}/check-in`, {
    method: "POST",
  });
}

export async function listQrCards(status = "") {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  return request<{ qrCards: QrCard[] }>(`/qr-cards?${params.toString()}`);
}

export async function lookupQrCard(code: string) {
  return request<{ qrCard: QrCard }>(`/qr-cards/${encodeURIComponent(code)}`);
}

export async function assignQrCard(vehicleEntryId: string, code: string) {
  return request<{ qrCard: QrCard; auditLog: AuditLog; registration: Registration }>("/qr-cards/assign", {
    method: "POST",
    body: JSON.stringify({ vehicleEntryId, code }),
  });
}

export async function listAudit(vehicleEntryId: string) {
  const params = new URLSearchParams({ vehicleEntryId });
  return request<{ auditLogs: AuditLog[] }>(`/qr-audit?${params.toString()}`);
}

export async function getVotingSettings() {
  return request<{ event: VotingSettings }>("/voting/settings");
}

export async function updateVotingSettings(
  input: Partial<Pick<VotingSettings, "votingOpen" | "judgingOpen" | "resultsPublished" | "peopleChoiceCutoff">>,
) {
  return request<{ event: VotingSettings }>("/voting/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getVotingTallies() {
  return request<{ event: Omit<VotingSettings, "id" | "name">; categories: CategoryVotingTally[] }>("/voting/tallies");
}
