/**
 * Update all Fly machines across all opflow-dev-* apps to the latest image.
 *
 * Usage:
 *   npx tsx update-all-machines.ts [image]
 *
 * Defaults image to registry.fly.io/opflow-cloud-dev-image:latest.
 * Requires flyctl to be installed and authenticated.
 */

import { execFile } from "node:child_process";
import { execSync } from "node:child_process";

const DEFAULT_IMAGE = "registry.fly.io/opflow-cloud-dev-image:latest";

function flyctl(args: string, timeoutMs = 30_000): string {
  return execSync(`flyctl ${args}`, { stdio: "pipe", timeout: timeoutMs }).toString("utf-8").trim();
}

function flyctlAsync(args: string[], timeoutMs = 5 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("flyctl", args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

interface App {
  Name?: string;
  name?: string;
}

interface Machine {
  id: string;
  name?: string;
  state?: string;
}

async function updateApp(app: string, image: string): Promise<{ app: string; ok: boolean; error?: string }> {
  try {
    const machinesJson = JSON.parse(flyctl(`machines list -a ${app} --json`)) as Machine[];

    if (machinesJson.length === 0) {
      console.log(`  [${app}] No machines, skipping.`);
      return { app, ok: true };
    }

    const results = await Promise.all(
      machinesJson.map(async (machine) => {
        console.log(`  [${app}] Updating machine ${machine.id} (state: ${machine.state ?? "unknown"})...`);
        await flyctlAsync(["machine", "update", machine.id, "--image", image, "-a", app, "--yes"]);
        console.log(`  [${app}] Done: ${machine.id}`);
      }),
    );

    return { app, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  [${app}] FAILED: ${msg}`);
    return { app, ok: false, error: msg };
  }
}

async function main() {
  const image = process.argv[2] ?? DEFAULT_IMAGE;

  console.log("Listing all Fly apps...");
  const appsJson = JSON.parse(flyctl("apps list --json")) as App[];
  const apps = appsJson
    .map((a) => a.Name ?? a.name ?? "")
    .filter((name) => name.startsWith("opflow-dev-"));

  if (apps.length === 0) {
    console.log("No opflow-dev-* apps found.");
    return;
  }

  console.log(`Found ${apps.length} app(s). Updating all machines to: ${image}\n`);

  const results = await Promise.all(apps.map((app) => updateApp(app, image)));

  const failed = results.filter((r) => !r.ok);
  console.log(`\nDone. Updated ${apps.length - failed.length}/${apps.length} app(s).`);
  if (failed.length > 0) {
    console.error(`Failed apps: ${failed.map((r) => r.app).join(", ")}`);
    process.exit(1);
  }
}

main();
