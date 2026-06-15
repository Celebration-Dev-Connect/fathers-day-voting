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

const DEFAULT_IMAGE_MAX_BYTES = 4.5 * 1024 * 1024;
const INITIAL_IMAGE_MAX_DIMENSION = 2048;
const MIN_IMAGE_DIMENSION = 1;
const INITIAL_JPEG_QUALITY = 0.85;
const MIN_JPEG_QUALITY = 0.1;
const DIMENSION_REDUCTION = 0.9;
const QUALITY_REDUCTION = 0.05;

function imageBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Compression failed")),
      "image/jpeg",
      quality,
    );
  });
}

export async function compressImage(file: File, maxBytes = DEFAULT_IMAGE_MAX_BYTES): Promise<File> {
  if (file.size <= maxBytes) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > INITIAL_IMAGE_MAX_DIMENSION || height > INITIAL_IMAGE_MAX_DIMENSION) {
        if (width >= height) {
          height = Math.round((height * INITIAL_IMAGE_MAX_DIMENSION) / width);
          width = INITIAL_IMAGE_MAX_DIMENSION;
        } else {
          width = Math.round((width * INITIAL_IMAGE_MAX_DIMENSION) / height);
          height = INITIAL_IMAGE_MAX_DIMENSION;
        }
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas unavailable")); return; }

      let quality = INITIAL_JPEG_QUALITY;
      try {
        while (true) {
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          const blob = await imageBlob(canvas, quality);

          if (blob.size <= maxBytes) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
            return;
          }

          const nextWidth = Math.max(MIN_IMAGE_DIMENSION, Math.round(width * DIMENSION_REDUCTION));
          const nextHeight = Math.max(MIN_IMAGE_DIMENSION, Math.round(height * DIMENSION_REDUCTION));
          const nextQuality = Math.max(MIN_JPEG_QUALITY, Number((quality - QUALITY_REDUCTION).toFixed(2)));
          if (nextWidth === width && nextHeight === height && nextQuality === quality) {
            reject(new Error("Could not compress image below the upload size limit"));
            return;
          }
          width = nextWidth;
          height = nextHeight;
          quality = nextQuality;
        }
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load image")); };
    img.src = url;
  });
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
