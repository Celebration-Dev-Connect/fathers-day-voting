import { API_URL } from "./config";

export type OwnerPhoto = {
  id: string;
  url: string | null;
  altText: string | null;
  sortOrder: number;
  moderationStatus: "PENDING" | "PROCESSING" | "HUMAN_REVIEW" | "APPROVED" | "REJECTED" | "FAILED";
  createdAt: string;
};

export type OwnerVehicle = {
  id: string;
  entryNumber: number;
  year: number;
  make: string;
  model: string;
  nickname: string | null;
  plateNumber: string | null;
  exteriorColor: string | null;
  buildStory: string;
  ownerAccessCode: string;
  status: "DRAFT" | "REGISTERED" | "CHECKED_IN";
  category: { id: string; name: string; slug: string };
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    publicName: string | null;
    publicNameOptIn: boolean;
    waiverAccepted: boolean;
  };
  photos: OwnerPhoto[];
};

export type OwnerVehicleSummary = {
  id: string;
  entryNumber: number;
  year: number;
  make: string;
  model: string;
  nickname: string | null;
  category: { id: string; name: string; slug: string };
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: options.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options.headers },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? body.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function ownerHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function createOwnerSession(payload: { lastName: string; accessCode: string }) {
  return request<{ token: string; vehicle: OwnerVehicle; vehicles: OwnerVehicleSummary[] }>("/owner/session", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getOwnerVehicle(vehicleId: string, token: string) {
  return request<{ vehicle: OwnerVehicle; vehicles: OwnerVehicleSummary[] }>(`/owner/vehicles/${encodeURIComponent(vehicleId)}`, {
    headers: ownerHeaders(token),
  });
}

export async function updateOwnerVehicle(
  vehicleId: string,
  token: string,
  payload: {
    owner: {
      firstName: string;
      lastName: string;
      phone: string;
      email: string;
      publicName: string;
      publicNameOptIn: boolean;
    };
    vehicle: {
      year: number;
      make: string;
      model: string;
      nickname?: string | null;
      plateNumber?: string | null;
      exteriorColor?: string | null;
      buildStory: string;
    };
  },
) {
  return request<{ vehicle: OwnerVehicle; vehicles: OwnerVehicleSummary[] }>(`/owner/vehicles/${encodeURIComponent(vehicleId)}`, {
    method: "PATCH",
    headers: ownerHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function uploadOwnerPhoto(vehicleId: string, token: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<{ id: string; status: "PENDING" }>(`/owner/vehicles/${encodeURIComponent(vehicleId)}/photos`, {
    method: "POST",
    headers: ownerHeaders(token),
    body: form,
  });
}
