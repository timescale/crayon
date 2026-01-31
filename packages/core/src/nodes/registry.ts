// packages/core/src/nodes/registry.ts
import type { Executable } from "../types.js";
import { builtinNodes } from "./builtin/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExecutable = Executable<any, any>;

export interface NodeRegistryConfig {
  /** User-defined nodes keyed by name */
  userNodes?: Record<string, AnyExecutable>;
}

/**
 * Registry for resolving nodes by name (used by agents for tool calling)
 */
export class NodeRegistry {
  private nodes: Map<string, AnyExecutable>;

  constructor(config: NodeRegistryConfig = {}) {
    this.nodes = new Map();

    // Register built-in nodes first
    for (const [name, node] of Object.entries(builtinNodes) as [string, AnyExecutable][]) {
      this.nodes.set(name, node);
    }

    // Register user nodes (can override built-ins if needed)
    for (const [name, node] of Object.entries(config.userNodes ?? {}) as [string, AnyExecutable][]) {
      this.nodes.set(name, node);
    }
  }

  /**
   * Get a node by name
   */
  getNode(name: string): AnyExecutable | undefined {
    return this.nodes.get(name);
  }

  /**
   * Get multiple nodes by name
   * @throws Error if any node is not found
   */
  getNodes(names: string[]): AnyExecutable[] {
    const nodes: AnyExecutable[] = [];
    const missing: string[] = [];

    for (const name of names) {
      const node = this.nodes.get(name);
      if (node) {
        nodes.push(node);
      } else {
        missing.push(name);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Nodes not found: ${missing.join(", ")}`);
    }

    return nodes;
  }

  /**
   * Check if a node exists
   */
  hasNode(name: string): boolean {
    return this.nodes.has(name);
  }

  /**
   * List all registered node names
   */
  listNodes(): string[] {
    return Array.from(this.nodes.keys());
  }
}
