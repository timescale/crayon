/**
 * Update all Fly machines across all crayon-dev-* apps to the latest image.
 *
 * Usage:
 *   npx tsx update-all-machines.ts [--image <image>] [--tag <tag>] [--app <app-name>] [--user <github-login>]
 *
 * Defaults image to registry.fly.io/crayon-cloud-dev-image:latest.
 * Use --tag (or -t) to specify just the tag (e.g. --tag test → registry.fly.io/crayon-cloud-dev-image:test).
 * Use --image (or -i) to specify the full Docker image.
 * Use --app (or -a) to update only a specific crayon-dev-* app.
 * Use --user (or -u) to update only machines belonging to a specific GitHub user.
 * Requires flyctl to be installed and authenticated.
 * --user requires AUTH_DATABASE_URL env var (or packages/auth-server/.env.local).
 */

import { execFile } from "node:child_process";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY = "registry.fly.io/crayon-cloud-dev-image";
const DEFAULT_IMAGE = `${REGISTRY}:latest`;

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
  config?: { image?: string };
}

async function updateApp(
  app: string,
  image: string,
): Promise<{ app: string; ok: boolean; skipped: number; updated: number; error?: string }> {
  try {
    const machinesJson = JSON.parse(flyctl(`machines list -a ${app} --json`)) as Machine[];

    if (machinesJson.length === 0) {
      console.log(`  [${app}] No machines, skipping.`);
      return { app, ok: true, skipped: 0, updated: 0 };
    }

    let skipped = 0;
    let updated = 0;

    await Promise.all(
      machinesJson.map(async (machine) => {
        const currentImage = machine.config?.image;
        if (currentImage && currentImage === image && image.includes("@sha256:")) {
          console.log(`  [${app}] Machine ${machine.id} already on ${image}, skipping.`);
          skipped++;
          return;
        }

        console.log(`  [${app}] Updating machine ${machine.id} (state: ${machine.state ?? "unknown"})...`);
        await flyctlAsync(["machine", "update", machine.id, "--image", image, "-a", app, "--yes"]);
        updated++;
        // Show the image digest after update
        try {
          const imageInfo = flyctl(`image show -a ${app} --json`);
          const images = JSON.parse(imageInfo) as { MachineID?: string; Digest?: string }[];
          const digest = images.find((i) => i.MachineID === machine.id)?.Digest ?? "unknown";
          console.log(`  [${app}] Done: ${machine.id} → ${digest}`);
        } catch {
          console.log(`  [${app}] Done: ${machine.id}`);
        }
      }),
    );

    return { app, ok: true, skipped, updated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  [${app}] FAILED: ${msg}`);
    return { app, ok: false, skipped: 0, updated: 0, error: msg };
  }
}

const USAGE = "Usage: npx tsx update-all-machines.ts [--image <image>] [--tag <tag>] [--app <app-name>] [--user <github-login>]";

function parseArgs(argv: string[]): { image: string; appFilter?: string; userFilter?: string } {
  const args = argv.slice(2);
  let appFilter: string | undefined;
  let userFilter: string | undefined;
  let image: string | undefined;
  let tag: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--app" || args[i] === "-a") {
      if (!args[i + 1]) {
        console.error(`Error: ${args[i]} requires a value.\n${USAGE}`);
        process.exit(1);
      }
      appFilter = args[i + 1];
      i++;
    } else if (args[i] === "--image" || args[i] === "-i") {
      if (!args[i + 1]) {
        console.error(`Error: ${args[i]} requires a value.\n${USAGE}`);
        process.exit(1);
      }
      image = args[i + 1];
      i++;
    } else if (args[i] === "--tag" || args[i] === "-t") {
      if (!args[i + 1]) {
        console.error(`Error: ${args[i]} requires a value.\n${USAGE}`);
        process.exit(1);
      }
      tag = args[i + 1];
      i++;
    } else if (args[i] === "--user" || args[i] === "-u") {
      if (!args[i + 1]) {
        console.error(`Error: ${args[i]} requires a value.\n${USAGE}`);
        process.exit(1);
      }
      userFilter = args[i + 1];
      i++;
    } else {
      console.error(`Error: Unknown argument "${args[i]}".\n${USAGE}`);
      process.exit(1);
    }
  }

  if (image && tag) {
    console.error(`Error: --image and --tag are mutually exclusive.\n${USAGE}`);
    process.exit(1);
  }

  const resolvedImage = image ?? (tag ? `${REGISTRY}:${tag}` : DEFAULT_IMAGE);
  return { image: resolvedImage, appFilter, userFilter };
}

/**
 * Look up fly_app_name values for machines belonging to a GitHub user.
 * Reads AUTH_DATABASE_URL from env or auth-server/.env.local.
 */
async function getMachinesForUser(githubLogin: string): Promise<string[]> {
  let dbUrl = process.env.AUTH_DATABASE_URL;
  if (!dbUrl) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const envPath = resolve(__dirname, "../../auth-server/.env.local");
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      const match = content.match(/^AUTH_DATABASE_URL=(.+)$/m);
      if (match) dbUrl = match[1];
    }
  }
  if (!dbUrl) {
    console.error("Error: AUTH_DATABASE_URL not set and auth-server/.env.local not found.");
    process.exit(1);
  }

  const pg = await import("pg");
  const client = new pg.default.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT dm.fly_app_name
       FROM dev_machines dm
       JOIN dev_machine_members dmm ON dm.id = dmm.machine_id
       JOIN users u ON u.id = dmm.user_id
       WHERE u.github_login = $1`,
      [githubLogin],
    );
    return result.rows.map((r: { fly_app_name: string }) => r.fly_app_name);
  } finally {
    await client.end();
  }
}

/**
 * Resolve an image tag to a pinned digest reference using `docker manifest inspect`.
 * This avoids Fly's registry tag caching returning a stale digest.
 * If the image already contains `@sha256:`, it's returned as-is.
 */
function resolveImageDigest(image: string): string {
  if (image.includes("@sha256:")) return image;
  try {
    // Ensure Docker is authenticated to the Fly registry
    if (image.includes("registry.fly.io")) {
      execSync("flyctl auth docker", { stdio: "pipe", timeout: 15_000 });
    }
    const output = execSync(`docker manifest inspect --verbose ${image}`, {
      stdio: "pipe",
      timeout: 30_000,
    })
      .toString("utf-8")
      .trim();
    const data = JSON.parse(output);
    const digest = data?.Descriptor?.digest;
    if (digest) {
      const pinned = `${image}@${digest}`;
      console.log(`Resolved ${image} → ${pinned}`);
      return pinned;
    }
    console.warn("Warning: manifest inspect succeeded but no Descriptor.digest found.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: could not resolve digest for ${image}, using tag as-is.\n  ${msg.split("\n")[0]}`);
  }
  return image;
}

async function main() {
  const { image: rawImage, appFilter, userFilter } = parseArgs(process.argv);

  // Resolve tag to digest to bypass Fly registry tag caching
  const image = resolveImageDigest(rawImage);

  let apps: string[];

  if (appFilter) {
    apps = [appFilter];
    console.log(`Targeting app: ${appFilter}`);
  } else if (userFilter) {
    console.log(`Looking up machines for user: ${userFilter}...`);
    apps = await getMachinesForUser(userFilter);
  } else {
    console.log("Listing all Fly apps...");
    const appsJson = JSON.parse(flyctl("apps list --json")) as App[];
    apps = appsJson
      .map((a) => a.Name ?? a.name ?? "")
      .filter((name) => name.startsWith("crayon-dev-"));
  }

  if (apps.length === 0) {
    console.log("No crayon-dev-* apps found.");
    return;
  }

  console.log(`Found ${apps.length} app(s). Updating all machines to: ${image}\n`);

  const results = await Promise.all(apps.map((app) => updateApp(app, image)));

  const failed = results.filter((r) => !r.ok);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
  console.log(
    `\nDone. ${totalUpdated} machine(s) updated, ${totalSkipped} already up-to-date, ${failed.length} app(s) failed.`,
  );
  if (failed.length > 0) {
    console.error(`Failed apps: ${failed.map((r) => r.app).join(", ")}`);
    process.exit(1);
  }
}

main();
