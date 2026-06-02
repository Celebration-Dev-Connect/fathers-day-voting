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

export async function getOwnerVehicle(publicToken: string) {
  return request<{ vehicle: OwnerVehicle }>(`/owner/vehicles/${encodeURIComponent(publicToken)}`);
}

export async function updateOwnerVehicle(
  publicToken: string,
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
  return request<{ vehicle: OwnerVehicle }>(`/owner/vehicles/${encodeURIComponent(publicToken)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function uploadOwnerPhoto(publicToken: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<{ id: string; status: "PENDING" }>(`/v/${encodeURIComponent(publicToken)}/photos`, {
    method: "POST",
    body: form,
  });
}
