import type { IncomingMessage, ServerResponse } from "node:http";
import { deploy, type DeployProgress } from "../cli/deploy.js";

/**
 * Handle deploy API requests (SSE endpoint).
 * Independent of database — uses auth-server for all DBOS Cloud operations.
 * Returns true if the request was handled.
 */
export async function handleDeployRequest(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
): Promise<boolean> {
  const url = (req.url ?? "").split("?")[0];
  const method = req.method ?? "GET";

  if (url !== "/api/deploy" || method !== "POST") {
    return false;
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  function sendEvent(data: DeployProgress): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  try {
    const result = await deploy(projectRoot, {
      onProgress: sendEvent,
    });

    if (result.success) {
      sendEvent({ step: "done", url: result.url });
    } else {
      sendEvent({ step: "error", message: result.error ?? "Deploy failed" });
    }
  } catch (err) {
    sendEvent({
      step: "error",
      message: err instanceof Error ? err.message : "Unexpected error",
    });
  }

  res.end();
  return true;
}
