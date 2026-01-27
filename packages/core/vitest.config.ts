import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  test: {
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
