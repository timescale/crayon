import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// All git operations run in process.cwd() (the app root).

async function git(
  ...args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args);
}

/** Check if the current directory is inside a git work tree. */
export async function isGitRepo(): Promise<boolean> {
  try {
    await git("rev-parse", "--is-inside-work-tree");
    return true;
  } catch {
    return false;
  }
}

// ── Auto-commit ────────────────────────────────────────────────

export interface AutoCommitResult {
  success: boolean;
  commitHash?: string;
  error?: string;
}

/**
 * Stage files and commit. Returns success even when there is nothing to commit
 * (no error, but commitHash will be undefined).
 */
export async function autoCommit(opts: {
  message: string;
  paths?: string[];
}): Promise<AutoCommitResult> {
  try {
    if (!(await isGitRepo())) {
      return { success: false, error: "Not a git repository" };
    }

    // Stage
    const paths = opts.paths ?? ["."];
    await git("add", ...paths);

    // Anything staged?
    try {
      await git("diff", "--cached", "--quiet");
      // exit 0 → nothing staged
      return { success: true };
    } catch {
      // exit 1 → there are staged changes, continue to commit
    }

    // Commit
    await git("commit", "-m", opts.message);

    // Get short hash
    const { stdout } = await git("rev-parse", "--short", "HEAD");
    return { success: true, commitHash: stdout.trim() };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Tags (first-run detection) ─────────────────────────────────

/** Check whether a lightweight tag exists. */
export async function tagExists(tag: string): Promise<boolean> {
  try {
    const { stdout } = await git("tag", "-l", tag);
    return stdout.trim() !== "";
  } catch {
    return false;
  }
}

/** Create a lightweight tag at HEAD. */
export async function createTag(tag: string): Promise<boolean> {
  try {
    await git("tag", tag);
    return true;
  } catch {
    return false;
  }
}

// ── HEAD ───────────────────────────────────────────────────────

/** Return the current HEAD commit hash, or null if not a git repo. */
export async function getHead(): Promise<string | null> {
  try {
    const { stdout } = await git("rev-parse", "HEAD");
    return stdout.trim();
  } catch {
    return null;
  }
}

// ── Version listing ────────────────────────────────────────────

export interface VersionEntry {
  hash: string;
  hashShort: string;
  date: string;
  message: string;
  body: string;
}

const RECORD_SEP = "\x1e";
const FIELD_SEP = "\x1f";

/**
 * List recent commits as version entries.
 * Default limit: 50.
 */
export async function listVersions(limit = 50): Promise<VersionEntry[]> {
  try {
    if (!(await isGitRepo())) return [];

    const format = ["%H", "%h", "%aI", "%s", "%b"].join(FIELD_SEP) + RECORD_SEP;
    const { stdout } = await git(
      "log",
      `--pretty=format:${format}`,
      `-n`,
      String(limit),
      "--",
    );

    if (!stdout.trim()) return [];

    return stdout
      .split(RECORD_SEP)
      .filter((r) => r.trim())
      .map((record) => {
        const [hash, hashShort, date, message, ...bodyParts] =
          record.split(FIELD_SEP);
        return {
          hash: hash.trim(),
          hashShort,
          date,
          message,
          body: bodyParts.join(FIELD_SEP).trim(),
        };
      });
  } catch {
    return [];
  }
}

// ── Version restore ────────────────────────────────────────────

export interface RestoreResult {
  success: boolean;
  filesRestored: string[];
  commitHash?: string;
  error?: string;
}

/**
 * Restore `src/crayon/` files from a previous commit, then auto-commit
 * the restoration.
 */
export async function restoreVersion(
  commitHash: string,
): Promise<RestoreResult> {
  // Validate hash to prevent unexpected input
  if (!/^[a-f0-9]+$/i.test(commitHash)) {
    return {
      success: false,
      filesRestored: [],
      error: "Invalid commit hash format",
    };
  }

  try {
    if (!(await isGitRepo())) {
      return {
        success: false,
        filesRestored: [],
        error: "Not a git repository",
      };
    }

    // Verify the commit exists
    const { stdout: objType } = await git("cat-file", "-t", commitHash);
    if (objType.trim() !== "commit") {
      return {
        success: false,
        filesRestored: [],
        error: `${commitHash} is not a commit`,
      };
    }

    // Restore src/crayon/ from that commit
    await git("checkout", commitHash, "--", "src/crayon/");

    // List what changed
    const { stdout: diffOutput } = await git(
      "diff",
      "--cached",
      "--name-only",
    );
    const filesRestored = diffOutput
      .trim()
      .split("\n")
      .filter((f) => f);

    // Get short hash for the message
    const { stdout: shortHash } = await git(
      "rev-parse",
      "--short",
      commitHash,
    );

    // Commit the restoration
    const result = await autoCommit({
      message: `Restore src/crayon/ to version ${shortHash.trim()}`,
    });

    return {
      success: true,
      filesRestored,
      commitHash: result.commitHash,
    };
  } catch (err) {
    return {
      success: false,
      filesRestored: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
