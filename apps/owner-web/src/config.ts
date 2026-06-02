function normalizeBasePath(value: string) {
  if (!value || value === "/") return "";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

const defaultApiUrl = import.meta.env.DEV ? "http://localhost:4000" : "/carshow/api";

export const PUBLIC_BASE_PATH = normalizeBasePath(import.meta.env.VITE_PUBLIC_BASE_PATH ?? "/carshow/owner");
export const API_URL = import.meta.env.VITE_API_URL ?? defaultApiUrl;
