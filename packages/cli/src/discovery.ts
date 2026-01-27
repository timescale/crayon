// packages/cli/src/discovery.ts
import fs from "fs";
import path from "path";
import { createJiti } from "jiti";
import type { Executable } from "0pflow";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkflowExecutable = Executable<any, any>;

const jiti = createJiti(import.meta.url);

export interface DiscoveryResult {
  workflows: WorkflowExecutable[];
  warnings: string[];
}

/**
 * Check if a value is a workflow executable
 */
function isWorkflow(value: unknown): value is WorkflowExecutable {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    (value as { type: string }).type === "workflow"
  );
}

/**
 * Discover and load workflow executables from generated/workflows/ directory
 * Uses jiti to load TypeScript files directly without compilation
 * Returns workflows and any warnings (caller decides whether to display warnings)
 */
export async function discoverWorkflows(
  projectDir: string
): Promise<DiscoveryResult> {
  const workflowDir = path.join(projectDir, "generated", "workflows");

  if (!fs.existsSync(workflowDir)) {
    return { workflows: [], warnings: [] };
  }

  const files = fs.readdirSync(workflowDir).filter(f => f.endsWith(".ts") || f.endsWith(".js"));
  const workflows: WorkflowExecutable[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    const filePath = path.join(workflowDir, file);

    try {
      const module = await jiti.import(filePath);

      // Find the workflow export in the module
      for (const value of Object.values(module as Record<string, unknown>)) {
        if (isWorkflow(value)) {
          workflows.push(value);
          break; // One workflow per file
        }
      }
    } catch (err) {
      warnings.push(`Failed to load workflow ${file}: ${err}`);
    }
  }

  return { workflows, warnings };
}
