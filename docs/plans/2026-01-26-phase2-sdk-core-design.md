# Phase 2: SDK Core Design

**Date:** 2026-01-26
**Status:** Approved
**Depends on:** Phase 1 (Project Scaffolding) - Complete

## Overview

Phase 2 implements the core crayon SDK that discovers, registers, and executes workflows with DBOS durability. The key design decision is a unified `ctx.run()` API with full TypeScript type safety for all executable types.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DBOS integration | Wrap internally | Clean API, hide DBOS complexity from users |
| Workflow discovery | Hybrid (barrel files) | Static imports work with all bundlers |
| Database setup | Share user's database | No extra provisioning, DBOS uses own tables |
| Node invocation | Direct function reference | Full type safety vs string-based lookup |
| Agent invocation | Direct function reference | Same type safety as nodes |
| Type generation | Zod schemas | Runtime validation + TypeScript inference |

## Public API

### Initialization

```typescript
import { createCrayon } from 'runcrayon';
import { workflows } from '@/generated/workflows';
import { agents } from '@/generated/agents';
import { nodes } from '@/nodes';

export const crayon = await createCrayon({
  workflows,
  agents,
  nodes,
  databaseUrl: process.env.DATABASE_URL,
});
```

### Instance Methods

```typescript
crayon.listWorkflows()              // Returns workflow names
crayon.getWorkflow(name)            // Returns workflow metadata
crayon.triggerWorkflow(name, inputs) // Executes by name (webhooks/UI)
```

### Workflow Definition

```typescript
import { z } from 'zod';
import { Workflow } from 'runcrayon';

export const icpScoring = Workflow.create({
  name: 'icp-scoring',
  version: 1,
  inputSchema: z.object({
    company_url: z.string(),
    scoring_criteria: z.string().optional().default('B2B SaaS $5M+ ARR'),
  }),
  outputSchema: z.object({
    qualification: z.enum(['qualified', 'not_qualified']),
    score: z.number(),
  }),

  async run(ctx, inputs) {
    const data = await ctx.run(companyResearcher, { company_url: inputs.company_url });
    const score = await ctx.run(calculateScore, { data });
    return { qualification: score >= 80 ? 'qualified' : 'not_qualified', score };
  },
});
```

### WorkflowContext

```typescript
export interface WorkflowContext {
  /** Run any executable (node, agent, workflow) as a durable step */
  run: <TInput, TOutput>(
    executable: Executable<TInput, TOutput>,
    inputs: TInput
  ) => Promise<TOutput>;

  /** Structured logging */
  log: (message: string, level?: 'info' | 'warn' | 'error' | 'debug') => void;
}
```

## Unified Executable Interface

All runnable types (Node, Agent, Workflow) implement the same interface:

```typescript
export interface Executable<TInput = unknown, TOutput = unknown> {
  name: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  execute: (ctx: WorkflowContext, inputs: TInput) => Promise<TOutput>;
}

// Factory functions
export const Node = { create: <I, O>(def: NodeDef<I, O>) => Executable<I, O> };
export const Agent = { create: <I, O>(def: AgentDef<I, O>) => Executable<I, O> };
export const Workflow = { create: <I, O>(def: WorkflowDef<I, O>) => Executable<I, O> };
```

This means `ctx.run()` works uniformly:

```typescript
await ctx.run(someNode, inputs);      // Function node
await ctx.run(someAgent, inputs);     // Agent
await ctx.run(someWorkflow, inputs);  // Sub-workflow
```

## Registration & Discovery

### Barrel Files (Compiler-Generated)

```typescript
// generated/workflows/index.ts
export { icpScoring } from './icp-scoring.js';
export { expansionFinder } from './expansion-finder.js';
export const workflows = { icpScoring, expansionFinder };

// generated/agents/index.ts
export { companyResearcher } from './company-researcher.js';
export { icpScorer } from './icp-scorer.js';
export const agents = { companyResearcher, icpScorer };
```

### User Nodes (User-Maintained)

```typescript
// src/nodes/index.ts
export { calculateScore } from './calculate-score.js';
export { formatReport } from './format-report.js';
export const nodes = { calculateScore, formatReport };
```

## DBOS Integration

### Initialization

```typescript
export async function createCrayon(config: CrayonConfig): Promise<Crayon> {
  await DBOS.launch({
    databaseUrl: config.databaseUrl,
  });

  const registry = buildRegistry(config.workflows, config.agents, config.nodes);

  return {
    listWorkflows: () => Object.keys(registry.workflows),
    getWorkflow: (name) => registry.workflows[name],
    triggerWorkflow: (name, inputs) => executeWorkflow(registry, name, inputs),
  };
}
```

### Step Wrapping

```typescript
function createWorkflowContext(): WorkflowContext {
  return {
    run: async (executable, inputs) => {
      const validated = executable.inputSchema.parse(inputs);
      return DBOS.step(executable.name, async () => {
        return executable.execute(ctx, validated);
      });
    },
    log: (message, level = 'info') => {
      DBOS.logger[level](message);
    },
  };
}
```

### What DBOS Provides

- Step results persisted to database
- Automatic retry on transient failures
- Workflow recovery after crashes
- Idempotency for workflow runs

## File Structure

```
packages/core/src/
├── index.ts           # Public exports
├── factory.ts         # createCrayon() implementation
├── context.ts         # WorkflowContext implementation
├── executable.ts      # Executable interface + Node.create(), Workflow.create()
├── agent.ts           # Agent.create() (stub for Phase 2)
├── registry.ts        # Executable registry and lookup
├── dbos-setup.ts      # DBOS initialization and step wrappers
└── types.ts           # Shared types, Zod utilities
```

## Phase 2 Scope

### Included

| Component | Status |
|-----------|--------|
| `createCrayon()` | Full implementation |
| `Workflow.create()` | Full implementation |
| `Node.create()` | Full implementation |
| `Agent.create()` | Stub (throws "Phase 3") |
| `ctx.run()` | Works for Node, Workflow |
| `ctx.log()` | Full implementation |
| DBOS integration | Steps, durability, recovery |
| Zod validation | Input/output schemas |

### Not Included (Later Phases)

- Agent execution (Phase 3)
- Tools system (Phase 3)
- Compiler (Phase 4)
- UI components (Phase 6)

## Dependencies

- `@dbos-inc/dbos-sdk` - Durability runtime
- `zod` - Schema validation

## Next Steps

After Phase 2:
1. Phase 3: Implement Agent.create() with Vercel AI SDK
2. Phase 3: Add tools system for agents
3. Phase 4: Build compiler to generate workflows/agents from specs
