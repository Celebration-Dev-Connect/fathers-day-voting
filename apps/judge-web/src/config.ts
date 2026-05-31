const defaultApiUrl = import.meta.env.DEV ? "http://localhost:4000" : `${window.location.origin}/carshow/api`;

export const API_URL = import.meta.env.VITE_API_URL ?? defaultApiUrl;
