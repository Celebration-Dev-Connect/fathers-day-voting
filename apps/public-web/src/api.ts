import type {
  PublicCategory,
  PublicEntry,
  PublicEvent,
  PublishedResultsSnapshot,
  PublishedVehiclePlacement,
  PublicSpecialAward,
  PublicVehicle,
} from "@carshow/carshow-components";
import { API_URL } from "./config";

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? body.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getPublicEvent() {
  return request<{ event: PublicEvent; categories: PublicCategory[]; specialAwards: PublicSpecialAward[] }>("/public/event");
}

export type VehicleResponse =
  | { assigned: false }
  | {
      assigned: true;
      vehicle: PublicVehicle;
      votingOpen: boolean;
      cutoffPassed: boolean;
      alreadyVotedInCategory: boolean;
    };

export async function getVehicle(token: string, voterKey?: string): Promise<VehicleResponse> {
  const params = voterKey ? `?voterKey=${encodeURIComponent(voterKey)}` : "";
  return request<VehicleResponse>(`/public/vehicles/${encodeURIComponent(token)}${params}`);
}

export async function castVote(token: string, voterKey: string) {
  return request<{ ok: true; categoryName: string }>(`/public/vehicles/${encodeURIComponent(token)}/vote`, {
    method: "POST",
    body: JSON.stringify({ voterKey }),
  });
}

export async function getCategoryEntries(slug: string, page: number) {
  return request<{ category: PublicCategory; entries: PublicEntry[]; pagination: Pagination }>(
    `/public/categories/${encodeURIComponent(slug)}/entries?page=${page}`,
  );
}

export async function getEntryByNumber(entryNumber: number) {
  return request<{ vehicle: PublicVehicle; placements: PublishedVehiclePlacement[] }>(`/public/entries/${entryNumber}`);
}

export async function getPublishedResults() {
  return request<{ results: PublishedResultsSnapshot }>("/public/results");
}

export async function submitBrowseVote(vehicleId: string, voterKey: string) {
  return request<{ ok: true; categoryName: string }>(
    `/public/entries/${encodeURIComponent(vehicleId)}/vote`,
    { method: "POST", body: JSON.stringify({ voterKey }) },
  );
}

export async function submitSpecialAwardVote(vehicleId: string, specialAwardId: string, voterKey: string) {
  return request<{ ok: true; specialAwardName: string }>(
    `/public/entries/${encodeURIComponent(vehicleId)}/special-awards/${encodeURIComponent(specialAwardId)}/vote`,
    { method: "POST", body: JSON.stringify({ voterKey }) },
  );
}

export async function uploadVisitorPhoto(vehicleId: string, file: File) {
  const form = new FormData();
  form.append("photo", file);
  const response = await fetch(`${API_URL}/public/entries/${encodeURIComponent(vehicleId)}/photos`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? body.error ?? `Upload failed with ${response.status}`);
  }
  return response.json() as Promise<{ id: string; status: string }>;
}
