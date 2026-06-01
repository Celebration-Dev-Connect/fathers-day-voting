const defaultApiUrl = import.meta.env.DEV ? "http://localhost:4000" : "/api";

export const API_URL = import.meta.env.VITE_API_URL ?? defaultApiUrl;
