// packages/cli/src/app.ts
import fs from "fs";
import path from "path";

/**
 * Get the app name from package.json in cwd
 * Returns undefined if not found
 */
export function getAppName(): string | undefined {
  const pkgPath = path.join(process.cwd(), "package.json");

  if (!fs.existsSync(pkgPath)) {
    return undefined;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.name;
  } catch {
    return undefined;
  }
}
