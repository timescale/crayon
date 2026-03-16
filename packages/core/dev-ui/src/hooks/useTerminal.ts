import { useRef, useEffect, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

export interface UseTerminalOptions {
  sendMessage: (msg: object) => void;
  ptyEvents: EventTarget;
  connected: boolean;
}

function createTerminal(sendRef: React.MutableRefObject<(msg: object) => void>) {
  const term = new Terminal({
    fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
    fontSize: 12,
    lineHeight: 1.2,
    theme: {
      background: "#1a1a1a",
      foreground: "#e8e4df",
      cursor: "#1a1a1a",
      cursorAccent: "#1a1a1a",
      selectionBackground: "rgba(255, 255, 255, 0.15)",
      black: "#1a1a1a",
      brightBlack: "#787068",
      white: "#e8e4df",
      brightWhite: "#faf9f7",
      red: "#ef4444",
      green: "#22c55e",
      yellow: "#eab308",
      blue: "#3b82f6",
      magenta: "#a855f7",
      cyan: "#06b6d4",
      brightRed: "#f87171",
      brightGreen: "#4ade80",
      brightYellow: "#facc15",
      brightBlue: "#60a5fa",
      brightMagenta: "#c084fc",
      brightCyan: "#22d3ee",
    },
    cursorBlink: false,
    cursorInactiveStyle: "none",
    scrollback: 10000,
    convertEol: true,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());

  term.onData((data) => {
    sendRef.current({ type: "pty-input", data });
  });

  return { term, fitAddon };
}

export function useTerminal({ sendMessage, ptyEvents, connected }: UseTerminalOptions) {
  const [ptyAlive, setPtyAlive] = useState(false);
  const [hasData, setHasData] = useState(false);

  // Stable ref for sendMessage so Terminal.onData doesn't recreate
  const sendRef = useRef(sendMessage);
  sendRef.current = sendMessage;

  // Create Terminal instance synchronously (not in useEffect) so it's
  // available immediately when child components mount and call attachTo.
  // React runs child effects before parent effects, so a useEffect here
  // would be too late.
  const termRef = useRef<{ term: Terminal; fitAddon: FitAddon } | null>(null);
  if (!termRef.current) {
    termRef.current = createTerminal(sendRef);
  }
  const { term, fitAddon } = termRef.current;

  // Buffer data received before terminal is opened on a DOM element
  const openedRef = useRef(false);
  const bufferRef = useRef<string[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      term.dispose();
      termRef.current = null;
    };
  }, [term]);

  // Subscribe to PTY events from the WebSocket
  useEffect(() => {
    const onData = (e: Event) => {
      const data = (e as CustomEvent).detail as string;
      if (openedRef.current) {
        term.write(data);
        setHasData(true);
      } else {
        bufferRef.current.push(data);
      }
    };
    const onExit = (e: Event) => {
      setPtyAlive(false);
      const msg = `\r\n\x1b[90m[Process exited with code ${(e as CustomEvent).detail}. Press Enter to restart.]\x1b[0m`;
      if (openedRef.current) {
        term.writeln(msg);
      } else {
        bufferRef.current.push(msg + "\r\n");
      }
    };
    const onSpawned = () => {
      setPtyAlive(true);
    };

    ptyEvents.addEventListener("data", onData);
    ptyEvents.addEventListener("exit", onExit);
    ptyEvents.addEventListener("spawned", onSpawned);
    return () => {
      ptyEvents.removeEventListener("data", onData);
      ptyEvents.removeEventListener("exit", onExit);
      ptyEvents.removeEventListener("spawned", onSpawned);
    };
  }, [ptyEvents, term]);

  // When WebSocket connects (or reconnects), ensure PTY is spawned with correct size.
  // The initial pty-resize from attachTo may have been lost if the WS wasn't open yet.
  useEffect(() => {
    if (connected && !ptyAlive && openedRef.current) {
      fitAddon.fit();
      sendRef.current({
        type: "pty-resize",
        data: { cols: term.cols, rows: term.rows },
      });
    }
  }, [connected, ptyAlive, term, fitAddon]);

  const attachTo = useCallback(
    (container: HTMLDivElement | null) => {
      if (!container) return;

      if (!openedRef.current) {
        // First time: open the terminal normally
        term.open(container);
        openedRef.current = true;

        // Flush any data buffered before the terminal was opened
        if (bufferRef.current.length > 0) {
          for (const chunk of bufferRef.current) {
            term.write(chunk);
          }
          bufferRef.current = [];
          setHasData(true);
        }
      } else if (term.element) {
        // Re-attach: move existing xterm DOM into the new container
        container.appendChild(term.element);
      }

      fitAddon.fit();
      term.focus();
      sendRef.current({
        type: "pty-resize",
        data: { cols: term.cols, rows: term.rows },
      });
    },
    [term, fitAddon],
  );

  const fit = useCallback(() => {
    fitAddon.fit();
    sendRef.current({
      type: "pty-resize",
      data: { cols: term.cols, rows: term.rows },
    });
  }, [term, fitAddon]);

  const restart = useCallback(() => {
    term.clear();
    sendRef.current({ type: "pty-spawn" });
  }, [term]);

  return { attachTo, fit, ptyAlive, hasData, restart };
}
