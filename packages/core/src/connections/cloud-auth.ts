/**
 * CLI authentication for the crayon cloud server.
 *
 * Adapted from the Pencil MCP auth pattern:
 *   /Users/cevian/Development/pencil/packages/mcp-server/src/auth.ts
 *
 * Flow:
 *   1. MCP/CLI calls authenticate()
 *   2. Creates session on server → gets {code, secret}
 *   3. Opens browser to /auth/cli?cli_code=X
 *   4. User signs in (GitHub OAuth) and approves
 *   5. Polls server until approved → saves token to ~/.crayon/credentials
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { exec } from "node:child_process";

const CREDENTIALS_DIR = join(homedir(), ".crayon");
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials");
const PENDING_AUTH_FILE = join(CREDENTIALS_DIR, "pending_auth");
const DEFAULT_SERVER_URL =
  process.env.CRAYON_SERVER_URL ?? "https://crayon.fly.dev";

const POLL_INTERVAL_MS = 2000;
const QUICK_POLL_ATTEMPTS = 60; // ~2 minutes

interface Credentials {
  token: string;
  serverUrl: string;
}

interface PendingAuth {
  code: string;
  secret: string;
  authUrl: string;
  serverUrl: string;
  createdAt: number;
}

function ensureDir(): void {
  if (!existsSync(CREDENTIALS_DIR)) {
    mkdirSync(CREDENTIALS_DIR, { recursive: true });
  }
}

function readCredentials(): Credentials | null {
  try {
    if (!existsSync(CREDENTIALS_FILE)) {
      return null;
    }
    const raw = readFileSync(CREDENTIALS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Credentials;
    if (!parsed.token) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readPendingAuth(): PendingAuth | null {
  try {
    if (!existsSync(PENDING_AUTH_FILE)) {
      return null;
    }
    const raw = readFileSync(PENDING_AUTH_FILE, "utf-8");
    const parsed = JSON.parse(raw) as PendingAuth;
    // Expire after 5 minutes
    if (Date.now() - parsed.createdAt > 5 * 60 * 1000) {
      unlinkSync(PENDING_AUTH_FILE);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePendingAuth(pending: PendingAuth): void {
  ensureDir();
  writeFileSync(PENDING_AUTH_FILE, JSON.stringify(pending, null, 2), "utf-8");
}

function clearPendingAuth(): void {
  try {
    if (existsSync(PENDING_AUTH_FILE)) {
      unlinkSync(PENDING_AUTH_FILE);
    }
  } catch {
    // ignore
  }
}

/**
 * Get the stored API token, or null if not authenticated.
 */
export function getToken(): string | null {
  // Environment variable takes precedence (for cloud deployments)
  if (process.env.CRAYON_TOKEN) {
    return process.env.CRAYON_TOKEN;
  }
  const creds = readCredentials();
  return creds?.token ?? null;
}

/**
 * Save an API token and server URL to ~/.crayon/credentials.
 */
export function saveToken(token: string, serverUrl?: string): void {
  ensureDir();
  const credentials: Credentials = {
    token,
    serverUrl: serverUrl ?? DEFAULT_SERVER_URL,
  };
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), "utf-8");
}

/**
 * Check if the user is authenticated (has a stored token).
 */
export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/**
 * Get the server URL from stored credentials, or the default.
 */
export function getServerUrl(): string {
  // Environment variable takes precedence (matches getToken() behavior)
  if (process.env.CRAYON_SERVER_URL) {
    return process.env.CRAYON_SERVER_URL;
  }
  const creds = readCredentials();
  return creds?.serverUrl ?? DEFAULT_SERVER_URL;
}

/**
 * Open a URL in the user's default browser.
 */
export function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === "darwin") {
    command = `open "${url}"`;
  } else if (platform === "win32") {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (error) => {
    if (error) {
      process.stderr.write(`Failed to open browser: ${error.message}\n`);
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check a pending auth session's status.
 */
async function checkPendingSession(
  serverUrl: string,
  code: string,
  secret: string,
): Promise<{ token: string } | null> {
  try {
    const checkResponse = await fetch(
      `${serverUrl}/api/auth/cli/check?code=${encodeURIComponent(code)}&secret=${encodeURIComponent(secret)}`,
    );

    if (!checkResponse.ok) return null;

    const checkData = (await checkResponse.json()) as {
      data: {
        status: "pending" | "approved" | "expired";
        token?: string;
      };
    };

    if (checkData.data.status === "approved" && checkData.data.token) {
      return { token: checkData.data.token };
    }

    if (checkData.data.status === "expired") {
      clearPendingAuth();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Error indicating the user needs to approve the auth session in their browser.
 */
export class AuthRequiredError extends Error {
  public readonly authUrl: string;

  constructor(authUrl: string) {
    super(
      `Authentication required. I've opened your browser to authorize access.\n\n` +
        `If the browser didn't open, visit this URL:\n${authUrl}\n\n` +
        `After you approve access in the browser, retry this command.`,
    );
    this.name = "AuthRequiredError";
    this.authUrl = authUrl;
  }
}

/**
 * Perform browser-based CLI authentication.
 *
 * Resumes a pending session if one exists (e.g. from a previous run that timed
 * out), otherwise creates a new one. Opens the browser and polls for up to
 * ~2 minutes. Throws AuthRequiredError if the user doesn't approve in time.
 */
export async function authenticate(): Promise<void> {
  const serverUrl = DEFAULT_SERVER_URL;

  // Resume a pending session if one exists, otherwise create a new one
  let pending = readPendingAuth();
  if (!pending) {
    const createResponse = await fetch(`${serverUrl}/api/auth/cli/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create auth session: ${errorText}`);
    }

    const createData = (await createResponse.json()) as {
      data: { code: string; secret: string };
    };
    const { code, secret } = createData.data;
    const authUrl = `${serverUrl}/auth/cli?cli_code=${code}`;

    pending = { code, secret, authUrl, serverUrl, createdAt: Date.now() };
    savePendingAuth(pending);
  }

  // Open browser and print URL
  process.stderr.write(`\nOpen this URL to authenticate:\n  ${pending.authUrl}\n\n`);
  openBrowser(pending.authUrl);

  // Poll until approved or timed out
  for (let attempt = 0; attempt < QUICK_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const result = await checkPendingSession(pending.serverUrl, pending.code, pending.secret);
    if (result) {
      saveToken(result.token, pending.serverUrl);
      clearPendingAuth();
      process.stderr.write("Authentication successful! Token saved.\n");
      return;
    }
  }

  // Not approved yet — throw with helpful message
  throw new AuthRequiredError(pending.authUrl);
}

export type AuthResult =
  | { status: "success" }
  | { status: "pending"; authUrl: string };

/**
 * Run the interactive CLI auth flow. Returns a result instead of throwing
 * AuthRequiredError, so callers don't need to import or handle that class.
 * Real errors (network failures, etc.) are still thrown.
 */
export async function authenticateForCli(): Promise<AuthResult> {
  try {
    await authenticate();
    return { status: "success" };
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      return { status: "pending", authUrl: err.authUrl };
    }
    throw err;
  }
}

/**
 * Clear stored credentials (logout).
 */
export function logout(): void {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      unlinkSync(CREDENTIALS_FILE);
    }
  } catch {
    // ignore
  }
  clearPendingAuth();
}
