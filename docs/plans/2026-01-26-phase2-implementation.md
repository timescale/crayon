# Phase 2: SDK Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the core crayon SDK with unified `ctx.run()` API and DBOS durability.

**Architecture:** All executable types (Node, Agent, Workflow) share the `Executable` interface. `ctx.run()` validates inputs with Zod, wraps execution as DBOS steps, and provides full TypeScript type safety. DBOS is wrapped internally - users never see decorators.

**Tech Stack:** TypeScript, Zod (validation), DBOS SDK (durability), Vitest (testing)

---

## Task 1: Types Foundation

**Files:**
- Modify: `packages/core/src/types.ts`

**Step 1: Write the Executable interface and related types**

```typescript
import { z } from "zod";

/**
 * Base interface for all executable types (Node, Agent, Workflow)
 */
export interface Executable<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly type: "node" | "agent" | "workflow";
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema?: z.ZodType<TOutput>;
  readonly execute: (ctx: WorkflowContext, inputs: TInput) => Promise<TOutput>;
}

/**
 * Context passed to workflow/node run functions
 */
export interface WorkflowContext {
  /** Run any executable (node, agent, workflow) as a durable step */
  run: <TInput, TOutput>(
    executable: Executable<TInput, TOutput>,
    inputs: TInput
  ) => Promise<TOutput>;

  /** Structured logging */
  log: (message: string, level?: LogLevel) => void;
}

export type LogLevel = "info" | "warn" | "error" | "debug";

/**
 * Configuration for createCrayon()
 */
export interface CrayonConfig {
  /** Database connection URL for DBOS durability */
  databaseUrl: string;
  /** Registered workflows */
  workflows?: Record<string, Executable>;
  /** Registered agents */
  agents?: Record<string, Executable>;
  /** Registered function nodes */
  nodes?: Record<string, Executable>;
}

/**
 * The crayon instance returned by createCrayon()
 */
export interface Crayon {
  /** List all registered workflow names */
  listWorkflows: () => string[];
  /** Get a workflow by name */
  getWorkflow: (name: string) => Executable | undefined;
  /** Trigger a workflow by name (for webhooks/UI) */
  triggerWorkflow: <T = unknown>(name: string, inputs: unknown) => Promise<T>;
}
```

**Step 2: Run TypeScript to verify types compile**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon build`
Expected: Successful compilation

**Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add Executable and WorkflowContext types"
```

---

## Task 2: Node.create() Factory

**Files:**
- Create: `packages/core/src/node.ts`
- Create: `packages/core/src/__tests__/node.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/node.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Node } from "../node.js";

describe("Node.create()", () => {
  it("creates an executable with correct properties", () => {
    const inputSchema = z.object({ value: z.number() });
    const outputSchema = z.object({ doubled: z.number() });

    const doubleNode = Node.create({
      name: "double",
      inputSchema,
      outputSchema,
      execute: async (_ctx, inputs) => ({ doubled: inputs.value * 2 }),
    });

    expect(doubleNode.name).toBe("double");
    expect(doubleNode.type).toBe("node");
    expect(doubleNode.inputSchema).toBe(inputSchema);
    expect(doubleNode.outputSchema).toBe(outputSchema);
  });

  it("infers input types from schema", async () => {
    const node = Node.create({
      name: "greet",
      inputSchema: z.object({ name: z.string() }),
      execute: async (_ctx, inputs) => `Hello, ${inputs.name}!`,
    });

    // Type check: inputs.name should be string
    const mockCtx = { run: async () => {}, log: () => {} } as any;
    const result = await node.execute(mockCtx, { name: "World" });
    expect(result).toBe("Hello, World!");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: FAIL - Cannot find module '../node.js'

**Step 3: Write Node.create() implementation**

```typescript
// packages/core/src/node.ts
import { z } from "zod";
import type { Executable, WorkflowContext } from "./types.js";

/**
 * Definition for creating a function node
 */
export interface NodeDefinition<TInput, TOutput> {
  name: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  execute: (ctx: WorkflowContext, inputs: TInput) => Promise<TOutput>;
}

/**
 * Factory for creating function node executables
 */
export const Node = {
  create<TInput, TOutput>(
    definition: NodeDefinition<TInput, TOutput>
  ): Executable<TInput, TOutput> {
    return {
      name: definition.name,
      type: "node",
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      execute: definition.execute,
    };
  },
};
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/node.ts packages/core/src/__tests__/node.test.ts
git commit -m "feat(core): add Node.create() factory"
```

---

## Task 3: Workflow.create() Factory

**Files:**
- Create: `packages/core/src/workflow.ts`
- Create: `packages/core/src/__tests__/workflow.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/workflow.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Workflow } from "../workflow.js";

describe("Workflow.create()", () => {
  it("creates an executable with correct properties", () => {
    const inputSchema = z.object({ url: z.string() });
    const outputSchema = z.object({ status: z.string() });

    const workflow = Workflow.create({
      name: "fetch-status",
      version: 1,
      inputSchema,
      outputSchema,
      run: async (_ctx, _inputs) => ({ status: "ok" }),
    });

    expect(workflow.name).toBe("fetch-status");
    expect(workflow.type).toBe("workflow");
    expect(workflow.version).toBe(1);
    expect(workflow.inputSchema).toBe(inputSchema);
  });

  it("execute calls run with context and inputs", async () => {
    const workflow = Workflow.create({
      name: "echo",
      version: 1,
      inputSchema: z.object({ message: z.string() }),
      run: async (_ctx, inputs) => inputs.message,
    });

    const mockCtx = { run: async () => {}, log: () => {} } as any;
    const result = await workflow.execute(mockCtx, { message: "hello" });
    expect(result).toBe("hello");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: FAIL - Cannot find module '../workflow.js'

**Step 3: Write Workflow.create() implementation**

```typescript
// packages/core/src/workflow.ts
import { z } from "zod";
import type { Executable, WorkflowContext } from "./types.js";

/**
 * Definition for creating a workflow
 */
export interface WorkflowDefinition<TInput, TOutput> {
  name: string;
  version: number;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  run: (ctx: WorkflowContext, inputs: TInput) => Promise<TOutput>;
}

/**
 * Extended executable interface for workflows (includes version)
 */
export interface WorkflowExecutable<TInput = unknown, TOutput = unknown>
  extends Executable<TInput, TOutput> {
  readonly version: number;
}

/**
 * Factory for creating workflow executables
 */
export const Workflow = {
  create<TInput, TOutput>(
    definition: WorkflowDefinition<TInput, TOutput>
  ): WorkflowExecutable<TInput, TOutput> {
    return {
      name: definition.name,
      type: "workflow",
      version: definition.version,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      execute: definition.run,
    };
  },
};
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/workflow.ts packages/core/src/__tests__/workflow.test.ts
git commit -m "feat(core): add Workflow.create() factory"
```

---

## Task 4: Agent.create() Stub

**Files:**
- Create: `packages/core/src/agent.ts`
- Create: `packages/core/src/__tests__/agent.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/agent.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Agent } from "../agent.js";

describe("Agent.create()", () => {
  it("creates an executable with correct properties", () => {
    const inputSchema = z.object({ query: z.string() });

    const agent = Agent.create({
      name: "researcher",
      inputSchema,
      specPath: "specs/agents/researcher.md",
    });

    expect(agent.name).toBe("researcher");
    expect(agent.type).toBe("agent");
    expect(agent.inputSchema).toBe(inputSchema);
  });

  it("execute throws not implemented error", async () => {
    const agent = Agent.create({
      name: "researcher",
      inputSchema: z.object({ query: z.string() }),
      specPath: "specs/agents/researcher.md",
    });

    const mockCtx = { run: async () => {}, log: () => {} } as any;
    await expect(agent.execute(mockCtx, { query: "test" })).rejects.toThrow(
      "Agent execution not implemented (Phase 3)"
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: FAIL - Cannot find module '../agent.js'

**Step 3: Write Agent.create() stub implementation**

```typescript
// packages/core/src/agent.ts
import { z } from "zod";
import type { Executable, WorkflowContext } from "./types.js";

/**
 * Definition for creating an agent
 */
export interface AgentDefinition<TInput, TOutput> {
  name: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  /** Path to agent spec markdown file */
  specPath: string;
}

/**
 * Extended executable interface for agents
 */
export interface AgentExecutable<TInput = unknown, TOutput = unknown>
  extends Executable<TInput, TOutput> {
  readonly specPath: string;
}

/**
 * Factory for creating agent executables (stub - Phase 3)
 */
export const Agent = {
  create<TInput, TOutput = unknown>(
    definition: AgentDefinition<TInput, TOutput>
  ): AgentExecutable<TInput, TOutput> {
    return {
      name: definition.name,
      type: "agent",
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      specPath: definition.specPath,
      execute: async (_ctx: WorkflowContext, _inputs: TInput): Promise<TOutput> => {
        throw new Error("Agent execution not implemented (Phase 3)");
      },
    };
  },
};
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/agent.ts packages/core/src/__tests__/agent.test.ts
git commit -m "feat(core): add Agent.create() stub (Phase 3)"
```

---

## Task 5: Registry

**Files:**
- Create: `packages/core/src/registry.ts`
- Create: `packages/core/src/__tests__/registry.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/registry.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Registry } from "../registry.js";
import { Node } from "../node.js";
import { Workflow } from "../workflow.js";

describe("Registry", () => {
  it("registers and retrieves workflows", () => {
    const workflow = Workflow.create({
      name: "test-workflow",
      version: 1,
      inputSchema: z.object({}),
      run: async () => "done",
    });

    const registry = new Registry({
      workflows: { "test-workflow": workflow },
    });

    expect(registry.getWorkflow("test-workflow")).toBe(workflow);
    expect(registry.listWorkflows()).toEqual(["test-workflow"]);
  });

  it("registers and retrieves nodes", () => {
    const node = Node.create({
      name: "test-node",
      inputSchema: z.object({}),
      execute: async () => "done",
    });

    const registry = new Registry({
      nodes: { "test-node": node },
    });

    expect(registry.getExecutable("test-node")).toBe(node);
  });

  it("returns undefined for unknown executables", () => {
    const registry = new Registry({});

    expect(registry.getWorkflow("unknown")).toBeUndefined();
    expect(registry.getExecutable("unknown")).toBeUndefined();
  });

  it("lists all registered executables", () => {
    const node = Node.create({
      name: "my-node",
      inputSchema: z.object({}),
      execute: async () => {},
    });
    const workflow = Workflow.create({
      name: "my-workflow",
      version: 1,
      inputSchema: z.object({}),
      run: async () => {},
    });

    const registry = new Registry({
      nodes: { "my-node": node },
      workflows: { "my-workflow": workflow },
    });

    const all = registry.listAll();
    expect(all).toContain("my-node");
    expect(all).toContain("my-workflow");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: FAIL - Cannot find module '../registry.js'

**Step 3: Write Registry implementation**

```typescript
// packages/core/src/registry.ts
import type { Executable } from "./types.js";
import type { WorkflowExecutable } from "./workflow.js";

export interface RegistryConfig {
  workflows?: Record<string, Executable>;
  agents?: Record<string, Executable>;
  nodes?: Record<string, Executable>;
}

/**
 * Registry for managing executables (workflows, agents, nodes)
 */
export class Registry {
  private workflows: Map<string, Executable>;
  private agents: Map<string, Executable>;
  private nodes: Map<string, Executable>;

  constructor(config: RegistryConfig) {
    this.workflows = new Map(Object.entries(config.workflows ?? {}));
    this.agents = new Map(Object.entries(config.agents ?? {}));
    this.nodes = new Map(Object.entries(config.nodes ?? {}));
  }

  /** Get a workflow by name */
  getWorkflow(name: string): WorkflowExecutable | undefined {
    return this.workflows.get(name) as WorkflowExecutable | undefined;
  }

  /** List all workflow names */
  listWorkflows(): string[] {
    return Array.from(this.workflows.keys());
  }

  /** Get any executable by name (searches all registries) */
  getExecutable(name: string): Executable | undefined {
    return (
      this.workflows.get(name) ??
      this.agents.get(name) ??
      this.nodes.get(name)
    );
  }

  /** List all registered executable names */
  listAll(): string[] {
    return [
      ...this.workflows.keys(),
      ...this.agents.keys(),
      ...this.nodes.keys(),
    ];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/registry.ts packages/core/src/__tests__/registry.test.ts
git commit -m "feat(core): add Registry for executable lookup"
```

---

## Task 6: WorkflowContext Implementation

**Files:**
- Create: `packages/core/src/context.ts`
- Create: `packages/core/src/__tests__/context.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/context.test.ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createWorkflowContext } from "../context.js";
import { Node } from "../node.js";

describe("createWorkflowContext()", () => {
  it("ctx.run() validates inputs and calls execute", async () => {
    const node = Node.create({
      name: "double",
      inputSchema: z.object({ value: z.number() }),
      execute: async (_ctx, inputs) => inputs.value * 2,
    });

    const ctx = createWorkflowContext();
    const result = await ctx.run(node, { value: 5 });

    expect(result).toBe(10);
  });

  it("ctx.run() throws on invalid inputs", async () => {
    const node = Node.create({
      name: "double",
      inputSchema: z.object({ value: z.number() }),
      execute: async (_ctx, inputs) => inputs.value * 2,
    });

    const ctx = createWorkflowContext();

    await expect(ctx.run(node, { value: "not a number" } as any)).rejects.toThrow();
  });

  it("ctx.log() calls the logger", () => {
    const logSpy = vi.fn();
    const ctx = createWorkflowContext({ logger: logSpy });

    ctx.log("test message", "info");
    ctx.log("warning", "warn");

    expect(logSpy).toHaveBeenCalledWith("test message", "info");
    expect(logSpy).toHaveBeenCalledWith("warning", "warn");
  });

  it("ctx.log() defaults to info level", () => {
    const logSpy = vi.fn();
    const ctx = createWorkflowContext({ logger: logSpy });

    ctx.log("test message");

    expect(logSpy).toHaveBeenCalledWith("test message", "info");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: FAIL - Cannot find module '../context.js'

**Step 3: Write createWorkflowContext implementation**

```typescript
// packages/core/src/context.ts
import type { Executable, WorkflowContext, LogLevel } from "./types.js";

export interface ContextOptions {
  /** Custom logger function (for testing or custom logging) */
  logger?: (message: string, level: LogLevel) => void;
}

const defaultLogger = (message: string, level: LogLevel) => {
  console[level === "debug" ? "log" : level](
    `[crayon:${level}] ${message}`
  );
};

/**
 * Create a WorkflowContext for executing workflows
 *
 * Note: In Phase 2, this does not integrate with DBOS.
 * DBOS step wrapping will be added when we integrate with the factory.
 */
export function createWorkflowContext(options: ContextOptions = {}): WorkflowContext {
  const logger = options.logger ?? defaultLogger;

  const ctx: WorkflowContext = {
    run: async <TInput, TOutput>(
      executable: Executable<TInput, TOutput>,
      inputs: TInput
    ): Promise<TOutput> => {
      // Validate inputs against schema
      const validated = executable.inputSchema.parse(inputs);

      // Execute (DBOS wrapping will be added in factory integration)
      return executable.execute(ctx, validated);
    },

    log: (message: string, level: LogLevel = "info") => {
      logger(message, level);
    },
  };

  return ctx;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/context.ts packages/core/src/__tests__/context.test.ts
git commit -m "feat(core): add WorkflowContext with ctx.run() and ctx.log()"
```

---

## Task 7: DBOS Integration

**Files:**
- Create: `packages/core/src/dbos.ts`
- Create: `packages/core/src/__tests__/dbos.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/dbos.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initializeDBOS, shutdownDBOS, createDurableContext } from "../dbos.js";
import { Node } from "../node.js";
import { z } from "zod";

// Mock DBOS SDK
vi.mock("@dbos-inc/dbos-sdk", () => ({
  DBOS: {
    setConfig: vi.fn(),
    launch: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    runStep: vi.fn().mockImplementation(async (fn) => fn()),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

describe("DBOS integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initializeDBOS()", () => {
    it("configures and launches DBOS with database URL", async () => {
      const { DBOS } = await import("@dbos-inc/dbos-sdk");

      await initializeDBOS({ databaseUrl: "postgres://localhost/test" });

      expect(DBOS.setConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          systemDatabaseUrl: "postgres://localhost/test",
        })
      );
      expect(DBOS.launch).toHaveBeenCalled();
    });
  });

  describe("shutdownDBOS()", () => {
    it("shuts down DBOS", async () => {
      const { DBOS } = await import("@dbos-inc/dbos-sdk");

      await shutdownDBOS();

      expect(DBOS.shutdown).toHaveBeenCalled();
    });
  });

  describe("createDurableContext()", () => {
    it("wraps executable calls in DBOS.runStep", async () => {
      const { DBOS } = await import("@dbos-inc/dbos-sdk");

      const node = Node.create({
        name: "test-node",
        inputSchema: z.object({ x: z.number() }),
        execute: async (_ctx, inputs) => inputs.x * 2,
      });

      const ctx = createDurableContext();
      await ctx.run(node, { x: 5 });

      expect(DBOS.runStep).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ name: "test-node" })
      );
    });

    it("ctx.log uses DBOS.logger", () => {
      const { DBOS } = await import("@dbos-inc/dbos-sdk");

      const ctx = createDurableContext();
      ctx.log("test message", "info");
      ctx.log("warning", "warn");

      expect(DBOS.logger.info).toHaveBeenCalledWith("test message");
      expect(DBOS.logger.warn).toHaveBeenCalledWith("warning");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: FAIL - Cannot find module '../dbos.js'

**Step 3: Write DBOS integration**

```typescript
// packages/core/src/dbos.ts
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Executable, WorkflowContext, LogLevel } from "./types.js";

export interface DBOSConfig {
  databaseUrl: string;
  appName?: string;
}

/**
 * Initialize DBOS with the given configuration
 */
export async function initializeDBOS(config: DBOSConfig): Promise<void> {
  DBOS.setConfig({
    name: config.appName ?? "crayon",
    systemDatabaseUrl: config.databaseUrl,
  });
  await DBOS.launch();
}

/**
 * Shutdown DBOS gracefully
 */
export async function shutdownDBOS(): Promise<void> {
  await DBOS.shutdown();
}

/**
 * Create a WorkflowContext that wraps calls in DBOS steps for durability
 */
export function createDurableContext(): WorkflowContext {
  const ctx: WorkflowContext = {
    run: async <TInput, TOutput>(
      executable: Executable<TInput, TOutput>,
      inputs: TInput
    ): Promise<TOutput> => {
      // Validate inputs against schema
      const validated = executable.inputSchema.parse(inputs);

      // Wrap execution in DBOS step for durability
      return DBOS.runStep(
        async () => executable.execute(ctx, validated),
        { name: executable.name }
      );
    },

    log: (message: string, level: LogLevel = "info") => {
      DBOS.logger[level](message);
    },
  };

  return ctx;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/dbos.ts packages/core/src/__tests__/dbos.test.ts
git commit -m "feat(core): add DBOS integration for durability"
```

---

## Task 8: Factory (createCrayon)

**Files:**
- Modify: `packages/core/src/factory.ts`
- Create: `packages/core/src/__tests__/factory.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/factory.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createCrayon } from "../factory.js";
import { Workflow } from "../workflow.js";
import { Node } from "../node.js";

// Mock DBOS
vi.mock("@dbos-inc/dbos-sdk", () => ({
  DBOS: {
    setConfig: vi.fn(),
    launch: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    runStep: vi.fn().mockImplementation(async (fn) => fn()),
    registerWorkflow: vi.fn().mockImplementation((fn) => fn),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

describe("createCrayon()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes DBOS and returns crayon instance", async () => {
    const crayon = await createCrayon({
      databaseUrl: "postgres://localhost/test",
    });

    expect(crayon).toBeDefined();
    expect(typeof crayon.listWorkflows).toBe("function");
    expect(typeof crayon.getWorkflow).toBe("function");
    expect(typeof crayon.triggerWorkflow).toBe("function");
  });

  it("listWorkflows returns registered workflow names", async () => {
    const workflow = Workflow.create({
      name: "test-workflow",
      version: 1,
      inputSchema: z.object({}),
      run: async () => "done",
    });

    const crayon = await createCrayon({
      databaseUrl: "postgres://localhost/test",
      workflows: { "test-workflow": workflow },
    });

    expect(crayon.listWorkflows()).toEqual(["test-workflow"]);
  });

  it("getWorkflow returns workflow by name", async () => {
    const workflow = Workflow.create({
      name: "my-workflow",
      version: 1,
      inputSchema: z.object({}),
      run: async () => "done",
    });

    const crayon = await createCrayon({
      databaseUrl: "postgres://localhost/test",
      workflows: { "my-workflow": workflow },
    });

    expect(crayon.getWorkflow("my-workflow")).toBe(workflow);
    expect(crayon.getWorkflow("unknown")).toBeUndefined();
  });

  it("triggerWorkflow executes workflow by name", async () => {
    const workflow = Workflow.create({
      name: "echo",
      version: 1,
      inputSchema: z.object({ message: z.string() }),
      run: async (_ctx, inputs) => ({ echoed: inputs.message }),
    });

    const crayon = await createCrayon({
      databaseUrl: "postgres://localhost/test",
      workflows: { echo: workflow },
    });

    const result = await crayon.triggerWorkflow("echo", { message: "hello" });
    expect(result).toEqual({ echoed: "hello" });
  });

  it("triggerWorkflow throws for unknown workflow", async () => {
    const crayon = await createCrayon({
      databaseUrl: "postgres://localhost/test",
    });

    await expect(crayon.triggerWorkflow("unknown", {})).rejects.toThrow(
      'Workflow "unknown" not found'
    );
  });

  it("triggerWorkflow validates inputs", async () => {
    const workflow = Workflow.create({
      name: "strict",
      version: 1,
      inputSchema: z.object({ required: z.string() }),
      run: async () => "done",
    });

    const crayon = await createCrayon({
      databaseUrl: "postgres://localhost/test",
      workflows: { strict: workflow },
    });

    await expect(crayon.triggerWorkflow("strict", {})).rejects.toThrow();
  });

  it("workflows can use ctx.run to call nodes", async () => {
    const doubleNode = Node.create({
      name: "double",
      inputSchema: z.object({ value: z.number() }),
      execute: async (_ctx, inputs) => inputs.value * 2,
    });

    const workflow = Workflow.create({
      name: "double-workflow",
      version: 1,
      inputSchema: z.object({ value: z.number() }),
      run: async (ctx, inputs) => {
        const doubled = await ctx.run(doubleNode, { value: inputs.value });
        return { result: doubled };
      },
    });

    const crayon = await createCrayon({
      databaseUrl: "postgres://localhost/test",
      workflows: { "double-workflow": workflow },
      nodes: { double: doubleNode },
    });

    const result = await crayon.triggerWorkflow("double-workflow", { value: 5 });
    expect(result).toEqual({ result: 10 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: FAIL - Tests fail because factory.ts has placeholder implementation

**Step 3: Write createCrayon implementation**

```typescript
// packages/core/src/factory.ts
import type { Executable, Crayon, CrayonConfig } from "./types.js";
import type { WorkflowExecutable } from "./workflow.js";
import { Registry } from "./registry.js";
import { initializeDBOS, createDurableContext } from "./dbos.js";

/**
 * Create a crayon instance
 */
export async function createCrayon(config: CrayonConfig): Promise<Crayon> {
  // Initialize DBOS for durability
  await initializeDBOS({ databaseUrl: config.databaseUrl });

  // Build registry from provided executables
  const registry = new Registry({
    workflows: config.workflows,
    agents: config.agents,
    nodes: config.nodes,
  });

  return {
    listWorkflows: () => registry.listWorkflows(),

    getWorkflow: (name: string) => registry.getWorkflow(name),

    triggerWorkflow: async <T = unknown>(
      name: string,
      inputs: unknown
    ): Promise<T> => {
      const workflow = registry.getWorkflow(name);
      if (!workflow) {
        throw new Error(`Workflow "${name}" not found`);
      }

      // Create durable context for this execution
      const ctx = createDurableContext();

      // Validate inputs and execute
      const validated = workflow.inputSchema.parse(inputs);
      return workflow.execute(ctx, validated) as Promise<T>;
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/factory.ts packages/core/src/__tests__/factory.test.ts
git commit -m "feat(core): implement createCrayon() factory"
```

---

## Task 9: Update Public Exports

**Files:**
- Modify: `packages/core/src/index.ts`

**Step 1: Update index.ts with all exports**

```typescript
// packages/core/src/index.ts
// crayon - AI-native workflow engine
export const VERSION = "0.1.0";

// Factory
export { createCrayon } from "./factory.js";

// Executable factories
export { Node } from "./node.js";
export type { NodeDefinition } from "./node.js";

export { Workflow } from "./workflow.js";
export type { WorkflowDefinition, WorkflowExecutable } from "./workflow.js";

export { Agent } from "./agent.js";
export type { AgentDefinition, AgentExecutable } from "./agent.js";

// Types
export type {
  Executable,
  WorkflowContext,
  LogLevel,
  CrayonConfig,
  Crayon,
} from "./types.js";
```

**Step 2: Verify build succeeds**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon build`
Expected: Successful compilation

**Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export all Phase 2 public APIs"
```

---

## Task 10: Integration Test

**Files:**
- Create: `packages/core/src/__tests__/integration.test.ts`

**Step 1: Write integration test**

```typescript
// packages/core/src/__tests__/integration.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createCrayon, Workflow, Node } from "../index.js";

// Mock DBOS
vi.mock("@dbos-inc/dbos-sdk", () => ({
  DBOS: {
    setConfig: vi.fn(),
    launch: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    runStep: vi.fn().mockImplementation(async (fn) => fn()),
    registerWorkflow: vi.fn().mockImplementation((fn) => fn),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

describe("crayon integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("complete workflow with multiple nodes", async () => {
    // Define nodes
    const fetchData = Node.create({
      name: "fetch-data",
      inputSchema: z.object({ url: z.string() }),
      outputSchema: z.object({ title: z.string(), body: z.string() }),
      execute: async (_ctx, inputs) => ({
        title: `Page: ${inputs.url}`,
        body: "Content here",
      }),
    });

    const summarize = Node.create({
      name: "summarize",
      inputSchema: z.object({ text: z.string() }),
      outputSchema: z.object({ summary: z.string() }),
      execute: async (_ctx, inputs) => ({
        summary: `Summary of: ${inputs.text.slice(0, 20)}...`,
      }),
    });

    // Define workflow
    const researchWorkflow = Workflow.create({
      name: "research",
      version: 1,
      inputSchema: z.object({ url: z.string() }),
      outputSchema: z.object({ title: z.string(), summary: z.string() }),
      run: async (ctx, inputs) => {
        ctx.log("Starting research workflow");

        const data = await ctx.run(fetchData, { url: inputs.url });
        ctx.log(`Fetched: ${data.title}`);

        const result = await ctx.run(summarize, { text: data.body });
        ctx.log("Summarization complete");

        return { title: data.title, summary: result.summary };
      },
    });

    // Create instance
    const crayon = await createCrayon({
      databaseUrl: "postgres://localhost/test",
      workflows: { research: researchWorkflow },
      nodes: { "fetch-data": fetchData, summarize },
    });

    // Execute
    const result = await crayon.triggerWorkflow("research", {
      url: "https://example.com",
    });

    expect(result).toEqual({
      title: "Page: https://example.com",
      summary: "Summary of: Content here...",
    });
  });

  it("nested workflow calls", async () => {
    const innerWorkflow = Workflow.create({
      name: "inner",
      version: 1,
      inputSchema: z.object({ value: z.number() }),
      run: async (_ctx, inputs) => inputs.value * 2,
    });

    const outerWorkflow = Workflow.create({
      name: "outer",
      version: 1,
      inputSchema: z.object({ value: z.number() }),
      run: async (ctx, inputs) => {
        const doubled = await ctx.run(innerWorkflow, { value: inputs.value });
        return doubled + 1;
      },
    });

    const crayon = await createCrayon({
      databaseUrl: "postgres://localhost/test",
      workflows: { outer: outerWorkflow, inner: innerWorkflow },
    });

    const result = await crayon.triggerWorkflow("outer", { value: 5 });
    expect(result).toBe(11); // (5 * 2) + 1
  });
});
```

**Step 2: Run all tests**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/core/src/__tests__/integration.test.ts
git commit -m "test(core): add integration tests for complete workflows"
```

---

## Task 11: Final Verification

**Step 1: Run full test suite**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon test`
Expected: All tests pass

**Step 2: Verify build**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon build`
Expected: Successful compilation with no errors

**Step 3: Verify TypeScript types**

Run: `cd /Users/cevian/Development/crayon && pnpm --filter runcrayon exec tsc --noEmit`
Expected: No type errors

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore(core): Phase 2 SDK Core complete"
```

---

## Summary

| Task | Component | Status |
|------|-----------|--------|
| 1 | Types foundation | |
| 2 | Node.create() | |
| 3 | Workflow.create() | |
| 4 | Agent.create() stub | |
| 5 | Registry | |
| 6 | WorkflowContext | |
| 7 | DBOS integration | |
| 8 | createCrayon() factory | |
| 9 | Public exports | |
| 10 | Integration tests | |
| 11 | Final verification | |

**Dependencies:**
- Tasks 2-4 depend on Task 1 (types)
- Task 5 depends on Tasks 2-4 (registry needs executables)
- Task 6 depends on Task 1 (context uses types)
- Task 7 depends on Task 6 (DBOS wraps context)
- Task 8 depends on Tasks 5, 7 (factory uses registry and DBOS)
- Task 9 depends on Tasks 2-4, 8 (exports everything)
- Task 10-11 depend on Task 9 (integration tests use exports)
