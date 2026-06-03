import type { Registration, RegistrationPayload } from "./types.js";

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const first = digits.slice(0, 3);
  const second = digits.slice(3, 6);
  const third = digits.slice(6, 10);

  if (digits.length > 6) return `${first}-${second}-${third}`;
  if (digits.length > 3) return `${first}-${second}`;
  return first;
}

export function vehicleName(registration: Registration): string {
  return `${registration.year} ${registration.make} ${registration.model}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function toDateTimeLocalValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromDateTimeLocalValue(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

export function payloadFromRegistration(registration: Registration): RegistrationPayload {
  return {
    owner: {
      firstName: registration.owner.firstName,
      lastName: registration.owner.lastName,
      phone: formatPhone(registration.owner.phone),
      email: registration.owner.email ?? "",
      publicName: registration.owner.publicName ?? "",
      publicNameOptIn: registration.owner.publicNameOptIn,
      waiverAccepted: registration.owner.waiverAccepted,
    },
    vehicle: {
      categoryId: registration.category.id,
      year: registration.year,
      make: registration.make,
      model: registration.model,
      nickname: registration.nickname ?? "",
      plateNumber: registration.plateNumber ?? "",
      exteriorColor: registration.exteriorColor ?? "",
      internalNotes: registration.internalNotes ?? "",
      buildStory: registration.buildStory ?? "",
    },
  };
}
