import type {
  AuditLog,
  Category,
  CategoryVotingTally,
  CeremonyData,
  DashboardMetrics,
  JudgeCategoryCompletion,
  PcoServicesTeam,
  PcoTeamRole,
  PhotoModerationStatus,
  PhotoReviewItem,
  QrCard,
  Registration,
  RegistrationPayload,
  StaffRole,
  StaffUser,
  SpecialAward,
  SpecialAwardVotingTally,
  VotingSettings,
} from "@carshow/carshow-components";
import { API_URL } from "./config";

const tokenKey = "carshow-admin-token";

export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

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
  const hasBody = options.body !== undefined && options.body !== null;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(hasBody && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.message ?? body.error ?? `Request failed with ${response.status}`, response.status, body);
  }

  return response.json() as Promise<T>;
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

export async function updateCategory(
  id: string,
  input: Partial<Pick<Category, "name" | "active" | "ceremonyOrder" | "importIdentifier" | "importYearMin" | "importYearMax">>,
) {
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
  input: Partial<Pick<SpecialAward, "name" | "description" | "active" | "ceremonyOrder">>,
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

export async function listTeamRoles() {
  return request<{ teamRoles: PcoTeamRole[] }>("/admin/pco-team-roles");
}

export async function searchPcoServicesTeams(query: string) {
  const params = new URLSearchParams({ q: query });
  return request<{ teams: PcoServicesTeam[] }>(`/admin/pco-services/teams/search?${params.toString()}`);
}

export async function getPcoServicesTeam(teamId: string) {
  return request<{ team: PcoServicesTeam }>(`/admin/pco-services/teams/${encodeURIComponent(teamId)}`);
}

export async function createTeamRole(input: {
  pcoTeamId: string;
  pcoTeamName: string;
  pcoServiceTypeName?: string | null;
  positionName?: string | null;
  role: StaffRole;
}) {
  return request<{ teamRole: PcoTeamRole }>("/admin/pco-team-roles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTeamRole(
  id: string,
  input: Partial<Pick<PcoTeamRole, "role" | "active">>,
) {
  return request<{ teamRole: PcoTeamRole }>(`/admin/pco-team-roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteTeamRole(id: string) {
  return request<{ ok: true }>(`/admin/pco-team-roles/${id}`, {
    method: "DELETE",
  });
}

export async function listRegistrations(search = "", filter?: "invited_not_logged_in") {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (filter) params.set("filter", filter);
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

export type OwnerSummary = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  publicName: string | null;
  publicNameOptIn: boolean;
  waiverAccepted: boolean;
  vehicleEntries: Array<{ id: string; entryNumber: number; year: number; make: string; model: string }>;
};

export async function listOwners(search = "") {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  return request<{ owners: OwnerSummary[] }>(`/owners?${params.toString()}`);
}

export async function createRegistrationForOwner(payload: RegistrationPayload, ownerId: string) {
  return request<{ registration: Registration }>("/registrations", {
    method: "POST",
    body: JSON.stringify({ ...payload, ownerId }),
  });
}

export async function updateRegistration(id: string, payload: RegistrationPayload) {
  return request<{ registration: Registration }>(`/registrations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export type RegistrationCsvPreviewRow = {
  entryNumber: number;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  suggestedOwnerGroup: string;
  suggestedOwnerGroupSize: number;
  existingOwner: { id: string; name: string; vehicleCount: number } | null;
  vehicleType: string;
  year: number;
  vehicleName: string;
  matchedCategoryIds: string[];
  status: "MATCHED" | "UNMATCHED" | "CONFLICT";
};

export type RegistrationImportItemStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "SKIPPED" | "FAILED";

export type RegistrationImportJob = {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "COMPLETED_WITH_ERRORS" | "FAILED";
  sourceFileName: string | null;
  totalItems: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  counts: {
    registrationsCompleted: number;
    registrationsFailed: number;
    photosCompleted: number;
    photosFailed: number;
    photosSkipped: number;
  };
  items: Array<{
    id: string;
    entryNumber: number;
    registrationStatus: RegistrationImportItemStatus;
    photoStatus: RegistrationImportItemStatus;
    registrationMessage: string | null;
    photoMessage: string | null;
  }>;
};

export async function previewRegistrationsCsv(csvText: string) {
  return request<{ rows: RegistrationCsvPreviewRow[] }>("/registrations/import-csv/preview", {
    method: "POST",
    body: JSON.stringify({ csvText }),
  });
}

export async function importRegistrationsCsv(
  csvText: string,
  categoryAssignments: Record<string, string>,
  ownerGroupAssignments: Record<string, string>,
  sourceFileName?: string,
) {
  return request<{ job: RegistrationImportJob }>("/registration-imports", {
    method: "POST",
    body: JSON.stringify({ csvText, categoryAssignments, ownerGroupAssignments, sourceFileName }),
  });
}

export async function getLatestRegistrationImport() {
  return request<{ job: RegistrationImportJob | null }>("/registration-imports/latest");
}

export async function getRegistrationImport(id: string) {
  return request<{ job: RegistrationImportJob }>(`/registration-imports/${encodeURIComponent(id)}`);
}

export async function retryFailedRegistrationImport(id: string) {
  return request<{ job: RegistrationImportJob }>(`/registration-imports/${encodeURIComponent(id)}/retry-failed`, {
    method: "POST",
  });
}

export async function checkInRegistration(id: string) {
  return request<{ registration: Registration }>(`/registrations/${id}/check-in`, {
    method: "POST",
  });
}

export async function uncheckInRegistration(id: string) {
  return request<{ registration: Registration }>(`/registrations/${id}/uncheck-in`, {
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

export async function generateQrCards(quantity: number) {
  return request<{ created: number; firstCode: string; lastCode: string }>("/qr-cards/generate", {
    method: "POST",
    body: JSON.stringify({ quantity }),
  });
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

export async function initializeEvent() {
  return request<{ event: VotingSettings }>("/voting/initialize-event", { method: "POST" });
}

export async function getVotingSettings() {
  return request<{ event: VotingSettings }>("/voting/settings");
}

export async function getCeremonyData() {
  return request<CeremonyData>("/voting/ceremony");
}

export async function updateVotingSettings(
  input: Partial<
    Pick<
      VotingSettings,
      | "registrationOpen"
      | "votingOpen"
      | "publicPhotoUploadsOpen"
      | "judgesVotingEnabled"
      | "judgingOpen"
      | "peopleChoiceCutoff"
    >
  >,
) {
  return request<{ event: VotingSettings }>("/voting/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function publishVotingResults() {
  return request<{ event: VotingSettings }>("/voting/results/publish", {
    method: "POST",
  });
}

export async function unpublishVotingResults() {
  return request<{ event: VotingSettings }>("/voting/results/unpublish", {
    method: "POST",
  });
}

export async function getVotingTallies() {
  return request<{
    event: Omit<VotingSettings, "id" | "name">;
    categories: CategoryVotingTally[];
    specialAwards: SpecialAwardVotingTally[];
  }>("/voting/tallies");
}

export type VoteReviewContext = {
  kind: "people-choice" | "special-award" | "judge";
  label: string;
  categoryId?: string;
  specialAwardId?: string;
};

export type VoteReviewVote = {
  id: string;
  kind: "PEOPLE_CHOICE" | "SPECIAL_AWARD";
  label: string;
  voterKey: string;
  ipAddress: string | null;
  userAgent: string | null;
  trustedIp: boolean;
  createdAt: string;
  excludedAt: string | null;
  excludedReason: string | null;
  excludedBy: string | null;
  flags: string[];
  flagDetails: Array<{ flag: string; detail: string; ballots?: string[] }>;
};

export type VoteReview = {
  vehicleEntryId: string;
  context: { categoryId: string | null; specialAwardId: string | null };
  resultsPublished: boolean;
  summary: { total: number; included: number; excluded: number; flagged: number };
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  votes: VoteReviewVote[];
};

export async function getVehicleVoteReview(
  vehicleEntryId: string,
  context: VoteReviewContext,
  options: { filter?: "all" | "flagged" | "excluded"; page?: number; pageSize?: number } = {},
) {
  const params = new URLSearchParams();
  if (context.categoryId) params.set("categoryId", context.categoryId);
  if (context.specialAwardId) params.set("specialAwardId", context.specialAwardId);
  if (options.filter) params.set("filter", options.filter);
  if (options.page !== undefined) params.set("page", options.page.toString());
  if (options.pageSize !== undefined) params.set("pageSize", options.pageSize.toString());
  const query = params.toString();
  return request<VoteReview>(
    `/voting/vehicles/${encodeURIComponent(vehicleEntryId)}/vote-review${query ? `?${query}` : ""}`,
  );
}

export async function updateVoteExclusion(
  kind: "PEOPLE_CHOICE" | "SPECIAL_AWARD",
  id: string,
  excluded: boolean,
  reason?: string,
) {
  return request<{ ok: true }>(`/voting/votes/${kind === "PEOPLE_CHOICE" ? "people-choice" : "special-award"}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ excluded, reason }),
  });
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

export async function listPhotoReviews(status: PhotoReviewQueue, page = 0, pageSize = 20) {
  const params = new URLSearchParams({ status, page: page.toString(), pageSize: pageSize.toString() });
  return request<{
    photos: PhotoReviewItem[];
    pagination: { page: number; pageSize: number; total: number; pageCount: number };
  }>(`/photos/review?${params.toString()}`);
}

export async function updatePhotoReviewStatus(id: string, status: Extract<PhotoModerationStatus, "APPROVED" | "REJECTED">) {
  return request<{ photo: { id: string; moderationStatus: PhotoModerationStatus } }>(`/photos/review/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function sendOwnerInviteEmail(id: string, force = false) {
  const url = `/registrations/${encodeURIComponent(id)}/send-owner-invite${force ? "?force=true" : ""}`;
  return request<{ sent: boolean; reason?: string; sentAt?: string }>(url, { method: "POST" });
}

export async function sendBulkOwnerInviteEmails(vehicleEntryIds?: string[]) {
  return request<{ queued: number; skipped: number; alreadySent: number }>(
    "/registrations/send-owner-invite-bulk",
    { method: "POST", body: JSON.stringify({ vehicleEntryIds }) },
  );
}

export async function downloadRegistrationPhotos(id: string) {
  const token = getToken();
  const response = await fetch(`${API_URL}/registrations/${encodeURIComponent(id)}/photos/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Download failed with ${response.status}`);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? "photos.zip";
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function getPhotoReviewImageUrl(id: string) {
  const token = getToken();
  const response = await fetch(`${API_URL}/photos/review/${encodeURIComponent(id)}/image`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Image failed with ${response.status}`);
  return URL.createObjectURL(await response.blob());
}
