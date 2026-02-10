import { watch } from "chokidar";
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative, extname, dirname } from "node:path";
import { extractDAGs, extractNodeDescription } from "./dag/extractor.js";
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
            const resolvedPath = resolve(dirname(absPath), importFile);
            if (!existsSync(resolvedPath)) continue;
            const nodeSource = readFileSync(resolvedPath, "utf-8");
            const description = await extractNodeDescription(nodeSource);
            if (description) {
              node.description = description;
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
        processFile(filePath);
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

  async function close() {
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer);
    }
    debounceTimers.clear();
    await watcher.close();
  }

  return { getState, close };
}
