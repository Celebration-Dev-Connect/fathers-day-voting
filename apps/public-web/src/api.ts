import type { PublicCategory, PublicEntry, PublicEvent, PublicVehicle } from "@carshow/carshow-components";
import { API_URL } from "./config";

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
  return request<{ event: PublicEvent; categories: PublicCategory[] }>("/public/event");
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

export async function getCategoryEntries(slug: string) {
  return request<{ category: PublicCategory; entries: PublicEntry[] }>(
    `/public/categories/${encodeURIComponent(slug)}/entries`,
  );
}
