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
