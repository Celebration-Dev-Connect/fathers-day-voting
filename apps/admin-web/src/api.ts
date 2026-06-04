import type {
  AuditLog,
  Category,
  CategoryVotingTally,
  DashboardMetrics,
  JudgeCategoryCompletion,
  PhotoModerationStatus,
  PhotoReviewItem,
  QrCard,
  Registration,
  RegistrationPayload,
  StaffUser,
  SpecialAward,
  SpecialAwardVotingTally,
  VotingSettings,
} from "@carshow/carshow-components";
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
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
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

export async function deleteCategory(id: string) {
  return request<{ ok: true }>(`/categories/${id}`, {
    method: "DELETE",
  });
}

export async function listSpecialAwards() {
  return request<{ specialAwards: SpecialAward[] }>("/special-awards");
}

export async function createSpecialAward(input: Pick<SpecialAward, "name"> & { description?: string }) {
  return request<{ specialAward: SpecialAward }>("/special-awards", {
    method: "POST",
    body: JSON.stringify({ ...input, active: true }),
  });
}

export async function updateSpecialAward(
  id: string,
  input: Partial<Pick<SpecialAward, "name" | "description" | "active">>,
) {
  return request<{ specialAward: SpecialAward }>(`/special-awards/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteSpecialAward(id: string) {
  return request<{ ok: true }>(`/special-awards/${id}`, {
    method: "DELETE",
  });
}

export async function listRegistrations(search = "") {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  return request<{ registrations: Registration[] }>(`/registrations?${params.toString()}`);
}

export async function getRegistration(id: string) {
  return request<{ registration: Registration }>(`/registrations/${encodeURIComponent(id)}`);
}

export async function getDashboardMetrics() {
  return request<{ metrics: DashboardMetrics }>("/registrations/metrics");
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

export async function uploadRegistrationPhoto(id: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<{ id: string; status: "PENDING" }>(`/registrations/${encodeURIComponent(id)}/photos`, {
    method: "POST",
    body: form,
  });
}

export async function setRegistrationPrimaryPhoto(id: string, photoId: string) {
  return request<{ registration: Registration }>(`/registrations/${encodeURIComponent(id)}/primary-photo`, {
    method: "PATCH",
    body: JSON.stringify({ photoId }),
  });
}

export async function deleteRegistrationPhoto(id: string, photoId: string) {
  return request<{ ok: true }>(
    `/registrations/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`,
    { method: "DELETE" },
  );
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
  input: Partial<
    Pick<
      VotingSettings,
      "registrationOpen" | "votingOpen" | "judgingOpen" | "resultsPublished" | "peopleChoiceCutoff"
    >
  >,
) {
  return request<{ event: VotingSettings }>("/voting/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getVotingTallies() {
  return request<{
    event: Omit<VotingSettings, "id" | "name">;
    categories: CategoryVotingTally[];
    specialAwards: SpecialAwardVotingTally[];
  }>("/voting/tallies");
}

export async function getJudgeCompletion() {
  return request<{ categories: JudgeCategoryCompletion[] }>("/voting/judge-completion");
}

export async function updateCategoryWinners(
  categoryId: string,
  winners: Array<{ vehicleEntryId: string; rank: number }>,
  reason?: string,
) {
  return request<{ ok: true }>(`/voting/categories/${categoryId}/winners`, {
    method: "PUT",
    body: JSON.stringify({ winners, reason }),
  });
}

export type PhotoReviewQueue = "needs-review" | "approved" | "rejected" | "all";

export async function listPhotoReviews(status: PhotoReviewQueue) {
  const params = new URLSearchParams({ status });
  return request<{ photos: PhotoReviewItem[] }>(`/photos/review?${params.toString()}`);
}

export async function updatePhotoReviewStatus(id: string, status: Extract<PhotoModerationStatus, "APPROVED" | "REJECTED">) {
  return request<{ photo: { id: string; moderationStatus: PhotoModerationStatus } }>(`/photos/review/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function getPhotoReviewImageUrl(id: string) {
  const token = getToken();
  const response = await fetch(`${API_URL}/photos/review/${encodeURIComponent(id)}/image`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Image failed with ${response.status}`);
  return URL.createObjectURL(await response.blob());
}
