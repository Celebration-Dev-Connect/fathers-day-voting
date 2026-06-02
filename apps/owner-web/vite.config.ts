import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const publicBasePath = process.env.VITE_PUBLIC_BASE_PATH ?? "/carshow/owner";
const normalizedBasePath = publicBasePath.endsWith("/") ? publicBasePath : `${publicBasePath}/`;

export default defineConfig({
  base: normalizedBasePath,
  plugins: [react()],
  server: {
    port: 3003,
  },
});
