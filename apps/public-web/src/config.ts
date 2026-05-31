function normalizeBasePath(value: string) {
  if (!value || value === "/") return "";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

export const PUBLIC_BASE_PATH = normalizeBasePath(import.meta.env.VITE_PUBLIC_BASE_PATH ?? "/show");

export const API_URL = import.meta.env.VITE_API_URL ?? `${PUBLIC_BASE_PATH}/api`;
