function normalizeBasePath(value: string) {
  if (!value || value === "/") return "";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function normalizePublicUrl(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export const PUBLIC_BASE_PATH = normalizeBasePath(import.meta.env.VITE_PUBLIC_BASE_PATH ?? "");

export const PUBLIC_APP_URL = normalizePublicUrl(
  import.meta.env.VITE_PUBLIC_APP_URL ?? `${window.location.origin}${PUBLIC_BASE_PATH}`,
);

export const API_URL = import.meta.env.VITE_API_URL ?? `${PUBLIC_BASE_PATH}/api`;
