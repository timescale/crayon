import { watch } from "chokidar";
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative, extname, dirname } from "node:path";
import { extractDAGs, extractNodeName, extractNodeDescription, extractNodeIntegrations } from "./dag/extractor.js";
import type { ProjectDAGs } from "./dag/types.js";
import type { WSMessage } from "./ws.js";

export interface WatcherOptions {
  projectRoot: string;
  onMessage: (message: WSMessage) => void;
}

function isWorkflowFile(filePath: string, projectRoot: string): boolean {
  const rel = relative(projectRoot, resolve(projectRoot, filePath));
  if (extname(rel) !== ".ts") return false;
  return (
    rel.startsWith("generated/workflows/") ||
    rel.startsWith("src/workflows/")
  );
}

export function createWatcher(options: WatcherOptions) {
  const { projectRoot, onMessage } = options;

  const state: ProjectDAGs = {
    workflows: [],
    parseErrors: [],
  };

  // Debounce map: filePath → timeout
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const DEBOUNCE_MS = 150;

  // Track in-flight processFile calls so consumers can await initial scan
  const pendingProcesses = new Set<Promise<void>>();

  async function processFile(filePath: string) {
    const absPath = resolve(projectRoot, filePath);
    const relPath = relative(projectRoot, absPath);

    try {
      const source = readFileSync(absPath, "utf-8");
      const dags = await extractDAGs(relPath, source);

      // Resolve node descriptions from imported files
      for (const dag of dags) {
        for (const node of dag.nodes) {
          if (!node.importPath) continue;
          try {
            let importFile = node.importPath;
            // Convert .js extension to .ts for source files
            if (importFile.endsWith(".js")) {
              importFile = importFile.slice(0, -3) + ".ts";
            }
            let resolvedPath = resolve(dirname(absPath), importFile);
            if (!existsSync(resolvedPath)) {
              // Fallback: try resolving relative to project root
              // Handles cases where generated workflow imports use paths
              // relative to project root (e.g. "../src/nodes/..." from generated/workflows/)
              const stripped = importFile.replace(/^(\.\.\/)+/, "");
              resolvedPath = resolve(projectRoot, stripped);
            }
            if (!existsSync(resolvedPath)) continue;
            const nodeSource = readFileSync(resolvedPath, "utf-8");
            const name = await extractNodeName(nodeSource);
            if (name) {
              node.nodeName = name;
            }
            const description = await extractNodeDescription(nodeSource);
            if (description) {
              node.description = description;
            }
            const integrations = await extractNodeIntegrations(nodeSource);
            if (integrations) {
              node.integrations = integrations;
            }
          } catch {
            // Skip nodes we can't resolve
          }
        }
      }

      // Remove old entries for this file
      state.workflows = state.workflows.filter((w) => w.filePath !== relPath);
      state.parseErrors = state.parseErrors.filter((e) => e.filePath !== relPath);

      // Add new DAGs
      for (const dag of dags) {
        state.workflows.push(dag);
        onMessage({ type: "workflow-updated", data: dag });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      state.workflows = state.workflows.filter((w) => w.filePath !== relPath);
      state.parseErrors = state.parseErrors.filter((e) => e.filePath !== relPath);
      state.parseErrors.push({ filePath: relPath, error: errorMsg });

      onMessage({
        type: "parse-error",
        data: { filePath: relPath, error: errorMsg },
      });
    }
  }

  function removeFile(filePath: string) {
    const absPath = resolve(projectRoot, filePath);
    const relPath = relative(projectRoot, absPath);

    state.workflows = state.workflows.filter((w) => w.filePath !== relPath);
    state.parseErrors = state.parseErrors.filter((e) => e.filePath !== relPath);

    onMessage({ type: "workflow-removed", data: { filePath: relPath } });
  }

  function handleFileChange(filePath: string) {
    if (!isWorkflowFile(filePath, projectRoot)) return;

    const existing = debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    debounceTimers.set(
      filePath,
      setTimeout(() => {
        debounceTimers.delete(filePath);
        const p = processFile(filePath).finally(() => pendingProcesses.delete(p));
        pendingProcesses.add(p);
      }, DEBOUNCE_MS),
    );
  }

  function handleFileRemove(filePath: string) {
    if (!isWorkflowFile(filePath, projectRoot)) return;
    removeFile(filePath);
  }

  // Watch directories (not globs — chokidar v4 doesn't support glob patterns).
  // Filter to .ts files in the event handlers instead.
  const watchDirs: string[] = [];
  const genDir = resolve(projectRoot, "generated/workflows");
  const srcDir = resolve(projectRoot, "src/workflows");
  if (existsSync(genDir)) watchDirs.push(genDir);
  if (existsSync(srcDir)) watchDirs.push(srcDir);

  // If directories don't exist yet, watch parent dirs so we detect when they're created
  if (watchDirs.length === 0) {
    const genParent = resolve(projectRoot, "generated");
    const srcParent = resolve(projectRoot, "src");
    if (existsSync(genParent)) watchDirs.push(genParent);
    if (existsSync(srcParent)) watchDirs.push(srcParent);
  }

  const watcher = watch(watchDirs, {
    ignoreInitial: false,
    persistent: true,
  });

  watcher.on("add", handleFileChange);
  watcher.on("change", handleFileChange);
  watcher.on("unlink", handleFileRemove);

  function getState(): ProjectDAGs {
    return { ...state };
  }

  /**
   * Wait for all in-flight file processing (including debounced initial scans) to complete.
   * Call this before reading state to ensure descriptions are resolved.
   */
  async function waitForReady(): Promise<void> {
    // Wait for debounce timers to fire
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 50));
    // Wait for all in-flight processFile calls
    while (pendingProcesses.size > 0) {
      await Promise.all(pendingProcesses);
    }
  }

  async function close() {
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer);
    }
    debounceTimers.clear();
    await watcher.close();
  }

  return { getState, waitForReady, close };
}
