/**
 * HTTP client for the 0pflow cloud server.
 *
 * Adapted from the Pencil MCP client pattern:
 *   /Users/cevian/Development/pencil/packages/mcp-server/src/client.ts
 *
 * Makes authenticated API calls using the token from cloud-auth.ts.
 * Auto-triggers authenticate() when not authenticated.
 */
import {
  getToken,
  getServerUrl,
  isAuthenticated,
  authenticate,
  AuthRequiredError,
} from "./cloud-auth.js";

export class AuthError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "Not authenticated with 0pflow cloud. Run `0pflow login` or set OPFLOW_TOKEN.",
    );
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Make an authenticated HTTP call to the 0pflow cloud server.
 * Returns the parsed response data (the `data` field from the response).
 * Throws AuthError if not authenticated, ApiError if the request fails.
 */
export async function apiCall(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  if (!isAuthenticated()) {
    // Attempt browser-based authentication (non-blocking, ~16s max)
    await authenticate();

    if (!isAuthenticated()) {
      throw new AuthError();
    }
  }

  const token = getToken()!;
  const serverUrl = getServerUrl();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(`${serverUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorData = (await response.json()) as { error?: string };
      if (errorData.error) errorMessage = errorData.error;
    } catch {
      // Response wasn't JSON (e.g. HTML error page) — use the status line
    }
    throw new ApiError(response.status, errorMessage);
  }

  const responseData = (await response.json()) as Record<string, unknown>;
  return responseData.data;
}

export { AuthRequiredError };
