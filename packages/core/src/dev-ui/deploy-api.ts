import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { deploy } from "../cli/deploy.js";
import { isAuthenticated } from "../connections/cloud-auth.js";
import { apiCall } from "../connections/cloud-client.js";

/**
 * Handle deploy endpoints for the Dev UI.
 * GET  /api/deploy — returns current deploy status (URL if previously deployed).
 * POST /api/deploy — streams progress events via SSE.
 *
 * Returns true if the request was handled.
 */
export async function handleDeployRequest(
  req: IncomingMessage,
  res: ServerResponse,
  projectDir: string,
): Promise<boolean> {
  const url = (req.url ?? "").split("?")[0];
  const method = req.method ?? "GET";

  if (url !== "/api/deploy") return false;

  // GET /api/deploy — check if app has been deployed before
  if (method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    try {
      const status = await getDeployStatus(projectDir);
      res.end(JSON.stringify(status));
    } catch {
      res.end(JSON.stringify({ deployed: false }));
    }
    return true;
  }

  if (method !== "POST") return false;

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const sendEvent = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await deploy(projectDir, {
      onProgress: (progress) => {
        sendEvent({ type: "progress", ...progress });
      },
    });

    if (result.success) {
      sendEvent({ type: "done", url: result.url });
    } else {
      sendEvent({ type: "error", message: result.error });
    }
  } catch (err) {
    sendEvent({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  res.end();
  return true;
}

/**
 * Check if the app has been previously deployed by calling the auth-server.
 */
async function getDeployStatus(
  projectDir: string,
): Promise<{ deployed: boolean; url?: string }> {
  if (!isAuthenticated()) return { deployed: false };

  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return { deployed: false };

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
  if (!pkg.name) return { deployed: false };

  try {
    const status = (await apiCall(
      "GET",
      `/api/deploy/status?appName=${encodeURIComponent(pkg.name)}`,
    )) as { status: string; url?: string };

    if (status.url) {
      return { deployed: true, url: status.url };
    }
    return { deployed: false };
  } catch {
    return { deployed: false };
  }
}
