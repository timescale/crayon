import type { IncomingMessage, ServerResponse } from "node:http";

const COOKIE_NAME = "devui_token";
const FLY_APP_NAME = process.env.FLY_APP_NAME;
const AUTH_SERVER_URL = process.env.CRAYON_SERVER_URL;

// Lazy-loaded jose module and parsed public key
let joseModule: typeof import("jose") | null = null;
let publicKey: Awaited<ReturnType<typeof import("jose").importSPKI>> | null =
  null;

async function getPublicKey() {
  if (publicKey) return publicKey;
  if (!joseModule) joseModule = await import("jose");

  const pem = process.env.DEV_UI_JWT_PUBLIC_KEY;
  if (!pem) throw new Error("DEV_UI_JWT_PUBLIC_KEY not set");

  // Env var may have literal \n — normalize to real newlines
  publicKey = await joseModule.importSPKI(pem.replace(/\\n/g, "\n"), "EdDSA");
  return publicKey;
}

interface AuthClaims {
  sub: string;
  app: string;
  login: string;
}

/**
 * Returns true if auth is required (cloud mode with public key configured).
 */
export function isAuthEnabled(): boolean {
  return !!(FLY_APP_NAME && process.env.DEV_UI_JWT_PUBLIC_KEY);
}

function getCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

async function verifyToken(token: string): Promise<AuthClaims | null> {
  try {
    const key = await getPublicKey();
    const { payload } = await joseModule!.jwtVerify(token, key, {
      algorithms: ["EdDSA"],
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.app !== "string" ||
      typeof payload.login !== "string"
    ) {
      return null;
    }

    // Token must be for this specific machine
    if (payload.app !== FLY_APP_NAME) {
      return null;
    }

    return {
      sub: payload.sub,
      app: payload.app,
      login: payload.login,
    };
  } catch {
    return null;
  }
}

function setAuthCookie(res: ServerResponse, token: string): void {
  const cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/dev",
    "Max-Age=86400",
  ].join("; ");
  res.setHeader("Set-Cookie", cookie);
}

/**
 * Handle /dev/__auth/callback — receives JWT from auth-server redirect,
 * sets HttpOnly cookie, redirects to /dev/.
 * Returns true if this route was handled.
 */
export async function handleAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
  devPath: string,
  fullUrl: string,
): Promise<boolean> {
  if (devPath !== "/__auth/callback") return false;

  const url = new URL(fullUrl, `https://${FLY_APP_NAME}.fly.dev`);
  const token = url.searchParams.get("token");

  if (!token) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(errorHtml("Missing token parameter."));
    return true;
  }

  const claims = await verifyToken(token);
  if (!claims) {
    res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      errorHtml("Invalid or expired token. Please try signing in again."),
    );
    return true;
  }

  setAuthCookie(res, token);
  res.writeHead(302, { Location: "/dev/" });
  res.end();
  return true;
}

/**
 * Check if the current request is authenticated.
 */
export async function authenticateRequest(
  req: IncomingMessage,
): Promise<AuthClaims | null> {
  const token = getCookie(req, COOKIE_NAME);
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Redirect to the auth-server for authentication.
 */
export function redirectToAuth(res: ServerResponse): void {
  const authUrl = `${AUTH_SERVER_URL}/auth/dev-ui?app=${encodeURIComponent(FLY_APP_NAME!)}`;
  res.writeHead(302, { Location: authUrl });
  res.end();
}

/**
 * Send a 401 JSON response (for API routes).
 */
export function sendUnauthorized(res: ServerResponse): void {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Unauthorized. Please refresh the page to sign in.",
    }),
  );
}

function errorHtml(message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Auth Error</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#faf9f7;color:#1a1a1a}
.c{text-align:center;max-width:400px}a{color:#1a1a1a}</style></head>
<body><div class="c"><h2>Authentication Error</h2><p>${message}</p>
<p><a href="/dev/">Return to Dev UI</a></p></div></body></html>`;
}
