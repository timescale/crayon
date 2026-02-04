import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Package root directory (relative to dist/mcp/)
export const packageRoot = join(__dirname, "..", "..");

// Monorepo root (up from packages/cli)
export const monorepoRoot = join(packageRoot, "..", "..");

// Templates directory at monorepo root level
export const templatesDir = join(monorepoRoot, "templates");

// Read version from package.json
const pkg = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf-8"),
);
export const version: string = pkg.version;
