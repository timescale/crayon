import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { ProjectDAGs, WorkflowDAG } from "./dag/types.js";
import { isAuthEnabled, authenticateRequest } from "./auth.js";

export type WSMessage =
  | { type: "full-sync"; data: ProjectDAGs }
  | { type: "workflow-updated"; data: WorkflowDAG }
  | { type: "workflow-removed"; data: { filePath: string } }
  | { type: "parse-error"; data: { filePath: string; error: string } }
  // PTY messages (server → client)
  | { type: "pty-data"; data: string }
  | { type: "pty-exit"; data: { code: number } }
  | { type: "pty-spawned"; data: { pid: number } };

export type WSClientMessage =
  | { type: "pty-input"; data: string }
  | { type: "pty-resize"; data: { cols: number; rows: number } }
  | { type: "pty-spawn" };

export function createWSServer(
  httpServer: Server,
  onClientMessage?: (ws: WebSocket, message: WSClientMessage) => void,
) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/dev/ws",
    verifyClient: isAuthEnabled()
      ? (info, callback) => {
          authenticateRequest(info.req)
            .then((claims) => {
              if (!claims) {
                callback(false, 401, "Unauthorized");
              } else {
                callback(true);
              }
            })
            .catch(() => {
              callback(false, 500, "Internal Server Error");
            });
        }
      : undefined,
  });

  wss.on("connection", (ws) => {
    if (onClientMessage) {
      ws.on("message", (raw) => {
        try {
          const msg: WSClientMessage = JSON.parse(raw.toString());
          onClientMessage(ws, msg);
        } catch {
          // Ignore malformed client messages
        }
      });
    }
  });

  function broadcast(message: WSMessage) {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  function sendTo(client: WebSocket, message: WSMessage) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  return { wss, broadcast, sendTo };
}
