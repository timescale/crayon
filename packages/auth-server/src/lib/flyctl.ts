/**
 * flyctl child process helpers.
 *
 * Provides synchronous execution for quick commands (app creation, IP allocation)
 * and async background execution for deploys (which take 2-5 minutes).
 */

import { execSync, spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";

// ── Synchronous execution ─────────────────────────────────────────

/**
 * Run a flyctl command synchronously. Returns stdout.
 * Throws on non-zero exit code.
 */
export function flyctlSync(
  args: string[],
  opts?: { cwd?: string },
): string {
  const env = {
    ...process.env,
    FLY_API_TOKEN: process.env.FLY_API_TOKEN,
  };

  try {
    const result = execSync(`flyctl ${args.join(" ")}`, {
      cwd: opts?.cwd,
      env,
      stdio: "pipe",
      timeout: 30000, // 30s timeout for sync commands
    });
    return result.toString("utf-8").trim();
  } catch (err) {
    const error = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const stderr = error.stderr?.toString("utf-8") ?? "";
    const stdout = error.stdout?.toString("utf-8") ?? "";
    throw new Error(
      `flyctl ${args[0]} failed: ${stderr || stdout || error.message}`,
    );
  }
}

// ── Async deploy execution ────────────────────────────────────────

export interface BuildProcess {
  exitCode: number | null;
  output: string;
  startTime: number;
  process?: ChildProcess;
}

/**
 * In-memory map of active builds. Uses globalThis to survive
 * Next.js dev mode hot reloads. In production, works because the
 * auth-server is a single persistent Fly Machine process.
 */
const globalForBuilds = globalThis as unknown as {
  activeBuilds?: Map<string, BuildProcess>;
};
const activeBuilds =
  globalForBuilds.activeBuilds ??
  (globalForBuilds.activeBuilds = new Map<string, BuildProcess>());

/**
 * Start a flyctl deploy in the background.
 * The deploy runs as a child process and is tracked in `activeBuilds`.
 */
export function startDeploy(
  flyAppName: string,
  cwd: string,
  onComplete?: (exitCode: number, output: string) => void,
): void {
  // Cancel any existing build for this app
  const existing = activeBuilds.get(flyAppName);
  if (existing?.process && existing.exitCode === null) {
    console.log(`[flyctl] Killing existing deploy for ${flyAppName}`);
    existing.process.kill("SIGTERM");
  }

  const build: BuildProcess = {
    exitCode: null,
    output: "",
    startTime: Date.now(),
  };

  const env = {
    ...process.env,
    FLY_API_TOKEN: process.env.FLY_API_TOKEN,
  };

  const proc = spawn("flyctl", ["deploy", "--remote-only", "--ha=false", "--app", flyAppName], {
    cwd,
    env,
    stdio: "pipe",
  });

  build.process = proc;
  activeBuilds.set(flyAppName, build);

  proc.stdout?.on("data", (data: Buffer) => {
    const line = data.toString("utf-8");
    build.output += line;
    console.log(`[flyctl:${flyAppName}] ${line.trim()}`);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const line = data.toString("utf-8");
    build.output += line;
    console.log(`[flyctl:${flyAppName}] ${line.trim()}`);
  });

  proc.on("exit", (code) => {
    build.exitCode = code ?? 1;
    build.process = undefined;
    console.log(
      `[flyctl] Deploy for ${flyAppName} finished with exit code ${build.exitCode}`,
    );

    // Clean up temp dir
    try {
      rmSync(cwd, { recursive: true, force: true });
    } catch {
      // ignore
    }

    onComplete?.(build.exitCode, build.output);
  });

  proc.on("error", (err) => {
    build.exitCode = 1;
    build.output += `\nProcess error: ${err.message}`;
    build.process = undefined;

    try {
      rmSync(cwd, { recursive: true, force: true });
    } catch {
      // ignore
    }

    onComplete?.(1, build.output);
  });
}

/**
 * Get the current build status for an app. Returns null if no build tracked.
 */
export function getBuildStatus(flyAppName: string): BuildProcess | null {
  return activeBuilds.get(flyAppName) ?? null;
}

/**
 * Clean up build tracking for an app.
 */
export function cleanupBuild(flyAppName: string): void {
  const build = activeBuilds.get(flyAppName);
  if (build?.process && build.exitCode === null) {
    build.process.kill("SIGTERM");
  }
  activeBuilds.delete(flyAppName);
}
