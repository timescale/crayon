import { useState, useEffect, useCallback, useRef } from "react";
import type { ProjectDAGs, WSMessage } from "../types";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10000;

export function useDAGSocket() {
  const [state, setState] = useState<ProjectDAGs>({
    workflows: [],
    parseErrors: [],
  });
  const [connected, setConnected] = useState(false);
  const reconnectAttempt = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const ptyEventsRef = useRef(new EventTarget());

  const sendMessage = useCallback((message: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, []);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/dev/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttempt.current = 0;
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** reconnectAttempt.current,
        RECONNECT_MAX_MS,
      );
      reconnectAttempt.current++;
      setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);

        switch (message.type) {
          case "full-sync":
            setState(message.data);
            break;

          case "workflow-updated":
            setState((prev) => {
              const workflows = prev.workflows.filter(
                (w) => w.filePath !== message.data.filePath || w.workflowName !== message.data.workflowName,
              );
              workflows.push(message.data);
              const parseErrors = prev.parseErrors.filter(
                (e) => e.filePath !== message.data.filePath,
              );
              return { workflows, parseErrors };
            });
            break;

          case "workflow-removed":
            setState((prev) => ({
              workflows: prev.workflows.filter(
                (w) => w.filePath !== message.data.filePath,
              ),
              parseErrors: prev.parseErrors.filter(
                (e) => e.filePath !== message.data.filePath,
              ),
            }));
            break;

          case "parse-error":
            setState((prev) => {
              const workflows = prev.workflows.filter(
                (w) => w.filePath !== message.data.filePath,
              );
              const parseErrors = prev.parseErrors.filter(
                (e) => e.filePath !== message.data.filePath,
              );
              parseErrors.push(message.data);
              return { workflows, parseErrors };
            });
            break;

          // PTY events — dispatch to EventTarget for terminal hook
          case "pty-data":
            ptyEventsRef.current.dispatchEvent(
              new CustomEvent("data", { detail: message.data }),
            );
            break;

          case "pty-exit":
            ptyEventsRef.current.dispatchEvent(
              new CustomEvent("exit", { detail: message.data.code }),
            );
            break;

          case "pty-spawned":
            ptyEventsRef.current.dispatchEvent(
              new CustomEvent("spawned", { detail: message.data.pid }),
            );
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { state, connected, sendMessage, ptyEvents: ptyEventsRef.current };
}
