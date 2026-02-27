import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type { IPty } from "node-pty";

const require = createRequire(import.meta.url);

function log(msg: string) {
  console.log(`[pty] ${msg}`);
}

/** Resolve the full path to `claude` using a login shell (which sources .zshrc/.bashrc). */
function resolveClaudePath(): string {
  try {
    const shell = process.env.SHELL || "/bin/bash";
    const path = execSync(`${shell} -l -c "which claude"`, {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    log(`Resolved claude path: ${path}`);
    return path;
  } catch (err) {
    log(`Failed to resolve claude path, falling back to "claude": ${err}`);
    return "claude";
  }
}

export interface PtyManager {
  isAlive(): boolean;
  spawn(cols?: number, rows?: number): number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  getScrollback(): string;
}

export interface PtyManagerOptions {
  projectRoot: string;
  claudeArgs?: string[];
  onData: (data: string) => void;
  onExit: (code: number) => void;
}

const WELCOME_PROMPT =
  "Welcome to your crayon project! What workflow would you like to create? Here are some ideas:\n\n" +
  '- "Create workflow to enrich leads from a CSV file with company data"\n' +
  '- "Create workflow to monitor website uptime and send Slack alerts"\n' +
  '- "Create workflow to sync Salesforce contacts to our database nightly"\n' +
  '- "Create workflow to score and route inbound leads based on firmographics"\n\n' +
  "Describe what you'd like to automate and I'll help you build it.";

/** Check if Claude Code has any existing sessions for the given project directory. */
function hasExistingSessions(projectRoot: string): boolean {
  // Claude stores sessions under ~/.claude/projects/<mangled-path>/
  // where the path is the absolute path with / replaced by -
  const mangledPath = resolve(projectRoot).replace(/\//g, "-");
  const sessionsDir = resolve(homedir(), ".claude", "projects", mangledPath);
  log(`Checking for sessions in: ${sessionsDir}`);
  try {
    const entries = readdirSync(sessionsDir);
    const sessions = entries.filter((e) => e.endsWith(".jsonl"));
    log(`Found ${sessions.length} session file(s)`);
    return sessions.length > 0;
  } catch (err) {
    log(`No sessions directory or error reading it: ${err}`);
    return false;
  }
}

const SCROLLBACK_SIZE = 100_000;

export function createPtyManager(options: PtyManagerOptions): PtyManager {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePty = require("node-pty") as typeof import("node-pty");

  log(`Creating PTY manager for project: ${options.projectRoot}`);

  let pty: IPty | null = null;
  let scrollback = "";

  let lastCols = 120;
  let lastRows = 30;

  function spawn(cols?: number, rows?: number): number {
    if (pty) {
      log("Killing existing PTY before respawn");
      try {
        pty.kill();
      } catch {
        /* ignore */
      }
      pty = null;
      scrollback = "";
    }

    if (cols) lastCols = cols;
    if (rows) lastRows = rows;

    const claudePath = resolveClaudePath();
    const baseArgs = options.claudeArgs ?? [];

    // If there's an existing session, resume it; otherwise use the intro prompt
    let sessionArgs: string[];
    if (hasExistingSessions(options.projectRoot)) {
      sessionArgs = ["--resume"];
      log("Using --resume (existing sessions found)");
    } else {
      sessionArgs = ["--", WELCOME_PROMPT];
      log("Using welcome prompt (no existing sessions)");
    }

    const allArgs = [...baseArgs, ...sessionArgs];
    log(`Spawning: ${claudePath} ${allArgs.map((a) => JSON.stringify(a)).join(" ")}`);
    log(`CWD: ${options.projectRoot}, cols=${lastCols}, rows=${lastRows}`);

    pty = nodePty.spawn(claudePath, allArgs, {
      name: "xterm-256color",
      cols: lastCols,
      rows: lastRows,
      cwd: options.projectRoot,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        FORCE_COLOR: "1",
      },
    });

    log(`PTY spawned with PID: ${pty.pid}`);

    pty.onData((data: string) => {
      scrollback += data;
      if (scrollback.length > SCROLLBACK_SIZE) {
        scrollback = scrollback.slice(-SCROLLBACK_SIZE);
      }
      options.onData(data);
    });

    pty.onExit(({ exitCode }: { exitCode: number }) => {
      log(`PTY exited with code: ${exitCode}`);
      options.onExit(exitCode ?? 0);
      pty = null;
    });

    return pty.pid;
  }

  return {
    isAlive: () => pty !== null,
    spawn,
    write: (data: string) => pty?.write(data),
    resize: (cols: number, rows: number) => {
      if (pty) {
        try {
          pty.resize(cols, rows);
        } catch {
          /* ignore if not alive */
        }
      }
    },
    kill: () => {
      if (pty) {
        try {
          pty.kill();
        } catch {
          /* ignore */
        }
        pty = null;
      }
    },
    getScrollback: () => scrollback,
  };
}
