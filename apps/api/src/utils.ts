export function normalizeSearch(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function normalizeQrCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const pathCode = parsed.pathname.split("/").filter(Boolean).at(-1);
    return pathCode || trimmed;
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

export function qrCodeLookupCandidates(value: string) {
  const normalized = normalizeQrCode(value);
  const match = /^(?:C-)?(\d+)$/i.exec(normalized);
  if (!match) return [normalized];

  const number = Number(match[1]);
  return [number.toString().padStart(4, "0"), `C-${number.toString().padStart(3, "0")}`];
}
