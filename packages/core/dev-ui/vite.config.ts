import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/dev/",
  build: {
    outDir: "../dist/dev-ui-client",
    emptyOutDir: true,
  },
});
