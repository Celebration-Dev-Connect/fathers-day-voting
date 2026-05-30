import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ["src/**/*.ts", "src/**/*.tsx"],
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "CarshowComponents",
      fileName: "carshow-components",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
  },
});
