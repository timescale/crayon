# Phase 1: Project Scaffolding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Initialize the crayon monorepo with core package structure and an example app.

**Architecture:** Monorepo with three packages (`core`, `ui`, `cli`) plus a `skills/` directory for Claude Code skills. An `examples/uptime-app/` directory contains a T3-stack app demonstrating crayon usage with a simple URL uptime checker workflow.

**Tech Stack:** TypeScript, pnpm workspaces, Biome (linting/formatting), Vitest (testing), DBOS, Vercel AI SDK

**Example App Stack (based on test40):** Next.js 16, tRPC 11.8, Drizzle ORM, Better Auth, PostgreSQL, Tailwind CSS, shadcn/ui

---

## Task 1: Initialize pnpm Workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`

**Step 1: Create root package.json**

```json
{
  "name": "crayon-monorepo",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "typescript": "^5.7.0"
  },
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20"
  }
}
```

**Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
  - "examples/*"
```

**Step 3: Create .npmrc**

```
auto-install-peers=true
strict-peer-dependencies=false
```

**Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc
git commit -m "chore: initialize pnpm workspace"
```

---

## Task 2: Add Biome Configuration

**Files:**
- Create: `biome.json`

**Step 1: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "organizeImports": {
    "enabled": true
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "indentWidth": 2
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "files": {
    "ignore": [
      "dist/",
      "node_modules/",
      ".next/",
      "generated/"
    ]
  }
}
```

**Step 2: Commit**

```bash
git add biome.json
git commit -m "chore: add Biome configuration"
```

---

## Task 3: Add TypeScript Root Configuration

**Files:**
- Create: `tsconfig.json`

**Step 1: Create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  },
  "exclude": ["node_modules", "dist", ".next"]
}
```

**Step 2: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add root TypeScript configuration"
```

---

## Task 4: Create Core Package Structure

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`

**Step 1: Create packages/core/package.json**

```json
{
  "name": "crayon",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@dbos-inc/dbos-sdk": "^2.0.0",
    "ai": "^4.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**Step 2: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create packages/core/src/index.ts**

```typescript
// crayon - AI-native workflow engine
export const VERSION = "0.1.0";

// Placeholder exports - will be implemented in Phase 2
export type { Workflow, WorkflowContext } from "./types.js";
export { createCrayon } from "./factory.js";
```

**Step 4: Create placeholder type file packages/core/src/types.ts**

```typescript
/**
 * Workflow definition interface
 */
export interface Workflow<TInput = unknown, TOutput = unknown> {
  name: string;
  version: number;
  run: (ctx: WorkflowContext, input: TInput) => Promise<TOutput>;
}

/**
 * Context passed to workflow run functions
 */
export interface WorkflowContext {
  /** Run an agent node */
  runAgent: <T = unknown>(name: string, input: unknown) => Promise<T>;
  /** Run a function node */
  runNode: <T = unknown>(name: string, input: unknown) => Promise<T>;
  /** Run a sub-workflow */
  runWorkflow: <T = unknown>(name: string, input: unknown) => Promise<T>;
  /** Call a built-in primitive */
  call: <T = unknown>(primitive: string, params: unknown) => Promise<T>;
  /** Log a message */
  log: (message: string, level?: "info" | "warn" | "error" | "debug") => void;
}
```

**Step 5: Create placeholder factory file packages/core/src/factory.ts**

```typescript
import type { Workflow } from "./types.js";

export interface CrayonConfig {
  workflowDir: string;
}

export interface Crayon {
  listWorkflows: () => Promise<string[]>;
  getWorkflow: (name: string) => Promise<Workflow | undefined>;
  triggerWorkflow: <T = unknown>(name: string, input: unknown) => Promise<T>;
}

/**
 * Create a crayon instance
 */
export async function createCrayon(_config: CrayonConfig): Promise<Crayon> {
  // Placeholder implementation - will be completed in Phase 2
  return {
    listWorkflows: async () => [],
    getWorkflow: async () => undefined,
    triggerWorkflow: async () => {
      throw new Error("Not implemented");
    },
  };
}
```

**Step 6: Commit**

```bash
git add packages/core/package.json packages/core/tsconfig.json packages/core/src/index.ts packages/core/src/types.ts packages/core/src/factory.ts
git commit -m "feat: add core package structure with placeholder types"
```

---

## Task 5: Create UI Package Structure

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`

**Step 1: Create packages/ui/package.json**

```json
{
  "name": "@crayon/ui",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "react": "^19.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**Step 2: Create packages/ui/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create packages/ui/src/index.ts**

```typescript
// @crayon/ui - React components for crayon dashboards
export { WorkflowList } from "./components/WorkflowList.js";
export { TriggerButton } from "./components/TriggerButton.js";
```

**Step 4: Create packages/ui/src/components/WorkflowList.tsx**

```tsx
import type { ReactNode } from "react";

export interface WorkflowInfo {
  name: string;
  version: number;
}

export interface WorkflowListProps {
  workflows: WorkflowInfo[];
  renderItem?: (workflow: WorkflowInfo) => ReactNode;
}

/**
 * Displays a list of available workflows
 */
export function WorkflowList({ workflows, renderItem }: WorkflowListProps) {
  if (workflows.length === 0) {
    return <div>No workflows found</div>;
  }

  return (
    <ul>
      {workflows.map((workflow) => (
        <li key={workflow.name}>
          {renderItem ? renderItem(workflow) : `${workflow.name} (v${workflow.version})`}
        </li>
      ))}
    </ul>
  );
}
```

**Step 5: Create packages/ui/src/components/TriggerButton.tsx**

```tsx
export interface TriggerButtonProps {
  workflowName: string;
  onTrigger: (name: string) => void | Promise<void>;
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * Button to trigger a workflow
 */
export function TriggerButton({
  workflowName,
  onTrigger,
  disabled = false,
  children,
}: TriggerButtonProps) {
  const handleClick = () => {
    onTrigger(workflowName);
  };

  return (
    <button type="button" onClick={handleClick} disabled={disabled}>
      {children ?? "Trigger"}
    </button>
  );
}
```

**Step 6: Commit**

```bash
git add packages/ui/package.json packages/ui/tsconfig.json packages/ui/src/index.ts packages/ui/src/components/WorkflowList.tsx packages/ui/src/components/TriggerButton.tsx
git commit -m "feat: add UI package with WorkflowList and TriggerButton components"
```

---

## Task 6: Create CLI Package Structure

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`

**Step 1: Create packages/cli/package.json**

```json
{
  "name": "@crayon/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "crayon": "./dist/index.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "crayon": "workspace:*",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**Step 2: Create packages/cli/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create packages/cli/src/index.ts**

```typescript
#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("crayon")
  .description("CLI for crayon workflow engine")
  .version("0.1.0");

program
  .command("list")
  .description("List all available workflows")
  .action(async () => {
    console.log("Listing workflows... (not yet implemented)");
  });

program
  .command("run <workflow>")
  .description("Run a workflow")
  .option("-i, --input <json>", "JSON input for the workflow")
  .action(async (workflow: string, options: { input?: string }) => {
    console.log(`Running workflow: ${workflow}`);
    if (options.input) {
      console.log(`Input: ${options.input}`);
    }
    console.log("(not yet implemented)");
  });

program
  .command("compile")
  .description("Compile workflow specs to TypeScript")
  .action(async () => {
    console.log("Compiling specs... (not yet implemented)");
  });

program.parse();
```

**Step 4: Commit**

```bash
git add packages/cli/package.json packages/cli/tsconfig.json packages/cli/src/index.ts
git commit -m "feat: add CLI package with list, run, compile commands"
```

---

## Task 7: Create Skills Directory Structure

**Files:**
- Create: `skills/compile-workflow/SKILL.md`
- Create: `skills/validate-spec/SKILL.md`

**Step 1: Create skills/compile-workflow/SKILL.md**

```markdown
---
name: compile-workflow
description: Compile workflow specs from markdown to TypeScript
---

# Compile Workflow Skill

This skill compiles workflow specifications from `specs/workflows/*.md` into TypeScript code in `generated/workflows/*.ts`.

## Usage

Invoke this skill when:
- A new workflow spec has been created
- An existing workflow spec has been modified
- The user asks to compile or regenerate workflows

## Process

1. Read workflow spec from `specs/workflows/<name>.md`
2. Parse frontmatter (name, version)
3. Extract inputs, steps, and outputs sections
4. Generate TypeScript workflow using the crayon SDK
5. Write to `generated/workflows/<name>.ts`

## Compiler Principles

1. **No invention** - Only emit code that directly maps to spec
2. **Fail closed** - Missing info → TODO comments + build failure, not guesses
3. **Deterministic** - Same spec → same output (modulo formatting)
4. **Readable output** - Generated code should be understandable

## Output Format

Generated workflows follow this structure:

```typescript
import { Workflow, WorkflowContext } from 'crayon';

interface <Name>Inputs {
  // ... from ## Inputs section
}

interface <Name>Outputs {
  // ... from ## Outputs section
}

export const <name> = Workflow.create({
  name: '<name>',
  version: <version>,

  async run(ctx: WorkflowContext, inputs: <Name>Inputs): Promise<<Name>Outputs> {
    // ... steps from ## Steps section
  },
});
```

## Handling Ambiguity

If a step is ambiguous or missing required information, emit:

```typescript
// TODO: <specific issue>
// UNRESOLVED: This step cannot be compiled until TODOs are addressed
throw new WorkflowCompilationError('Unresolved TODOs in step N');
```
```

**Step 2: Create skills/validate-spec/SKILL.md**

```markdown
---
name: validate-spec
description: Validate workflow and agent spec structure and references
---

# Validate Spec Skill

This skill validates workflow and agent specifications for correctness.

## Usage

Invoke this skill when:
- Before compiling a workflow
- After creating or modifying a spec
- User asks to validate specs

## Validation Checks

### Workflow Specs

1. **Structure validation**
   - Has valid YAML frontmatter with `name` and `version`
   - Has `## Inputs` section
   - Has `## Steps` section with numbered steps
   - Has `## Outputs` section

2. **Reference validation**
   - All referenced nodes exist (agents in `specs/agents/`, functions in `src/nodes/`)
   - Primitives are valid built-in primitives
   - Sub-workflows exist in `specs/workflows/`

3. **Data flow validation**
   - Step inputs reference valid outputs from previous steps
   - No undefined variables
   - Types align between steps (best effort)

4. **Control flow validation**
   - No unreachable steps
   - Conditions reference valid variables

### Agent Specs

1. **Structure validation**
   - Has valid YAML frontmatter with `name` and `tools`
   - Has task description
   - Has output format

2. **Tool validation**
   - All tools exist (built-in primitives or user tools in `src/tools/`)

## Output

Report validation results:

```
Validating specs/workflows/icp-scoring.md...
✓ Structure: Valid
✓ References: All 3 agents found
✓ Data flow: All variables defined
✓ Control flow: No unreachable steps

Validation passed.
```

Or with errors:

```
Validating specs/workflows/icp-scoring.md...
✓ Structure: Valid
✗ References: Agent 'company-researcher' not found in specs/agents/
✓ Data flow: All variables defined
✗ Control flow: Step 5 is unreachable

Validation failed with 2 errors.
```
```

**Step 3: Commit**

```bash
git add skills/compile-workflow/SKILL.md skills/validate-spec/SKILL.md
git commit -m "feat: add compile-workflow and validate-spec skills"
```

---

## Task 8: Create Example Uptime App (T3 Stack)

The example app is a full T3-stack app (matching test40 structure) with crayon directories added.

**Files to create:**
- `examples/uptime-app/package.json`
- `examples/uptime-app/tsconfig.json`
- `examples/uptime-app/next.config.js`
- `examples/uptime-app/drizzle.config.ts`
- `examples/uptime-app/biome.jsonc`
- `examples/uptime-app/src/env.js`
- `examples/uptime-app/src/server/db/schema.ts`
- `examples/uptime-app/src/server/db/index.ts`
- `examples/uptime-app/src/server/api/trpc.ts`
- `examples/uptime-app/src/server/api/root.ts`
- `examples/uptime-app/src/server/api/routers/check.ts`
- `examples/uptime-app/src/trpc/react.tsx`
- `examples/uptime-app/src/trpc/query-client.ts`
- `examples/uptime-app/src/trpc/server.ts`
- `examples/uptime-app/src/app/layout.tsx`
- `examples/uptime-app/src/app/page.tsx`
- `examples/uptime-app/src/app/api/trpc/[trpc]/route.ts`
- crayon directories: `specs/workflows/`, `specs/agents/`, `src/nodes/`, `src/tools/`, `generated/workflows/`

**Step 1: Create examples/uptime-app/package.json**

```json
{
  "name": "uptime-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "check": "biome check --write .",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "crayon": "workspace:*",
    "@crayon/ui": "workspace:*",
    "@t3-oss/env-nextjs": "^0.11.0",
    "@tanstack/react-query": "^5.90.0",
    "@trpc/client": "^11.8.0",
    "@trpc/react-query": "^11.8.0",
    "@trpc/server": "^11.8.0",
    "drizzle-orm": "^0.41.0",
    "next": "^16.1.0",
    "postgres": "^3.4.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "superjson": "^2.2.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.3.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "drizzle-kit": "^0.30.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 2: Create examples/uptime-app/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create examples/uptime-app/next.config.js**

```javascript
import "./src/env.js";

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

**Step 4: Create examples/uptime-app/drizzle.config.ts**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: [process.env.DATABASE_SCHEMA ?? "public"],
  tablesFilter: ["*"],
});
```

**Step 5: Create examples/uptime-app/biome.jsonc**

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.3.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "organizeImports": { "enabled": true },
  "formatter": { "enabled": true, "indentStyle": "tab" },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "files": { "ignore": ["dist/", "node_modules/", ".next/", "generated/"] }
}
```

**Step 6: Create examples/uptime-app/src/env.js**

```javascript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    DATABASE_SCHEMA: z.string().default("public"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_SCHEMA: process.env.DATABASE_SCHEMA,
    NODE_ENV: process.env.NODE_ENV,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
```

**Step 7: Create examples/uptime-app/src/server/db/schema.ts**

```typescript
import { pgSchema, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { env } from "~/env.js";

export const schema = pgSchema(env.DATABASE_SCHEMA);

export const urls = schema.table("urls", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const checks = schema.table("checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  urlId: uuid("url_id").notNull().references(() => urls.id, { onDelete: "cascade" }),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  error: text("error"),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
});

export const urlsRelations = relations(urls, ({ many }) => ({
  checks: many(checks),
}));

export const checksRelations = relations(checks, ({ one }) => ({
  url: one(urls, { fields: [checks.urlId], references: [urls.id] }),
}));
```

**Step 8: Create examples/uptime-app/src/server/db/index.ts**

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "~/env.js";
import * as schema from "./schema.js";

const globalForDb = globalThis as unknown as { conn: postgres.Sql | undefined };

const conn = globalForDb.conn ?? postgres(env.DATABASE_URL);
if (env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
```

**Step 9: Create examples/uptime-app/src/server/api/trpc.ts**

```typescript
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "~/server/db/index.js";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  return { db, ...opts };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
```

**Step 10: Create examples/uptime-app/src/server/api/routers/check.ts**

This router integrates with crayon to trigger the url-check workflow.

```typescript
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc.js";
import { urls, checks } from "~/server/db/schema.js";
import { eq, desc } from "drizzle-orm";
import { crayon } from "~/server/crayon.js";

export const checkRouter = createTRPCRouter({
  listUrls: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.urls.findMany({
      orderBy: [urls.createdAt],
      with: { checks: { limit: 1, orderBy: [desc(checks.checkedAt)] } },
    });
  }),

  addUrl: publicProcedure
    .input(z.object({ url: z.string().url(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [result] = await ctx.db.insert(urls).values(input).returning();
      return result;
    }),

  deleteUrl: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(urls).where(eq(urls.id, input.id));
    }),

  // This triggers the crayon url-check workflow
  checkUrl: publicProcedure
    .input(z.object({ urlId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const url = await ctx.db.query.urls.findFirst({
        where: eq(urls.id, input.urlId),
      });
      if (!url) throw new Error("URL not found");

      // Trigger crayon workflow instead of inline fetch
      const result = await crayon.triggerWorkflow("url-check", {
        url: url.url,
      });

      // Save result to database
      const [check] = await ctx.db
        .insert(checks)
        .values({
          urlId: input.urlId,
          statusCode: result.status_code,
          responseTimeMs: result.response_time_ms,
          error: result.error,
        })
        .returning();

      return check;
    }),

  getHistory: publicProcedure
    .input(z.object({ urlId: z.string().uuid(), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.checks.findMany({
        where: eq(checks.urlId, input.urlId),
        orderBy: [desc(checks.checkedAt)],
        limit: input.limit,
      });
    }),
});
```

**Step 11: Create examples/uptime-app/src/server/crayon.ts**

This initializes the crayon instance for the app.

```typescript
import { createCrayon } from "crayon";

// Initialize crayon with workflow directory
export const crayon = await createCrayon({
  workflowDir: "./generated/workflows",
});
```

**Step 12: Create examples/uptime-app/src/server/api/root.ts**

```typescript
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc.js";
import { checkRouter } from "~/server/api/routers/check.js";

export const appRouter = createTRPCRouter({
  check: checkRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
```

**Step 13: Create examples/uptime-app/src/trpc/query-client.ts**

```typescript
import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import superjson from "superjson";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30 * 1000 },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });
```

**Step 14: Create examples/uptime-app/src/trpc/react.tsx**

```typescript
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchStreamLink, loggerLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { useState } from "react";
import superjson from "superjson";
import type { AppRouter } from "~/server/api/root.js";
import { createQueryClient } from "./query-client.js";

let clientQueryClientSingleton: ReturnType<typeof createQueryClient> | undefined;
const getQueryClient = () => {
  if (typeof window === "undefined") return createQueryClient();
  return (clientQueryClientSingleton ??= createQueryClient());
};

export const api = createTRPCReact<AppRouter>();

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({ enabled: (op) => process.env.NODE_ENV === "development" }),
        httpBatchStreamLink({
          transformer: superjson,
          url: `${getBaseUrl()}/api/trpc`,
          headers: () => ({ "x-trpc-source": "react" }),
        }),
      ],
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {props.children}
      </api.Provider>
    </QueryClientProvider>
  );
}

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
```

**Step 15: Create examples/uptime-app/src/trpc/server.ts**

```typescript
import "server-only";
import { createHydrationHelpers } from "@trpc/react-query/rsc";
import { cache } from "react";
import { createCaller, type AppRouter } from "~/server/api/root.js";
import { createTRPCContext } from "~/server/api/trpc.js";
import { createQueryClient } from "./query-client.js";

const createContext = cache(async () => {
  const heads = new Headers();
  heads.set("x-trpc-source", "rsc");
  return createTRPCContext({ headers: heads });
});

const getQueryClient = cache(createQueryClient);
const caller = createCaller(createContext);
export const { trpc: api, HydrateClient } = createHydrationHelpers<AppRouter>(
  caller,
  getQueryClient
);
```

**Step 16: Create examples/uptime-app/src/app/api/trpc/[trpc]/route.ts**

```typescript
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "~/server/api/root.js";
import { createTRPCContext } from "~/server/api/trpc.js";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
  });

export { handler as GET, handler as POST };
```

**Step 17: Create examples/uptime-app/src/app/layout.tsx**

```tsx
import type { Metadata } from "next";
import { TRPCReactProvider } from "~/trpc/react.js";

export const metadata: Metadata = {
  title: "Uptime App - crayon Example",
  description: "Simple URL uptime checker demonstrating crayon workflows",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
```

**Step 18: Create examples/uptime-app/src/app/page.tsx**

```tsx
import { api, HydrateClient } from "~/trpc/server.js";

export default async function Home() {
  void api.check.listUrls.prefetch();

  return (
    <HydrateClient>
      <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
        <h1>Uptime Checker</h1>
        <p>Simple URL monitoring app demonstrating crayon workflows.</p>
        <p>
          <code>specs/workflows/url-check.md</code> - Workflow to check URL status
        </p>
      </main>
    </HydrateClient>
  );
}
```

**Step 19: Create crayon directories with .gitkeep files**

Create these directories with empty .gitkeep files:
- `examples/uptime-app/specs/workflows/.gitkeep`
- `examples/uptime-app/specs/agents/.gitkeep`
- `examples/uptime-app/src/nodes/.gitkeep`
- `examples/uptime-app/src/tools/.gitkeep`
- `examples/uptime-app/generated/workflows/.gitkeep`

**Step 20: Create example workflow spec: examples/uptime-app/specs/workflows/url-check.md**

This is the actual crayon workflow that checks URL status.

```markdown
---
name: url-check
version: 1
---

# URL Check Workflow

Check if a URL is reachable and return its status code and response time.

## Inputs

- url: string (required) - The URL to check
- timeout_ms: number (optional, defaults to 5000) - Request timeout in milliseconds

## Steps

### 1. Fetch URL

Make an HTTP HEAD request to the URL and capture the response.

**Node:** `http-head` (function)
**Input:** url, timeout_ms
**Output:** `response`

## Outputs

- status_code: number | null - HTTP status code (null if request failed)
- response_time_ms: number - Time taken for the request
- error: string | null - Error message if request failed
- checked_at: string - ISO timestamp of when check was performed
```

**Step 21: Create function node: examples/uptime-app/src/nodes/http-head.ts**

This is the function node referenced by the workflow.

```typescript
import type { NodeDefinition } from "crayon";

interface HttpHeadInput {
  url: string;
  timeout_ms?: number;
}

interface HttpHeadOutput {
  status_code: number | null;
  response_time_ms: number;
  error: string | null;
  checked_at: string;
}

export const httpHead: NodeDefinition<HttpHeadInput, HttpHeadOutput> = {
  name: "http-head",
  async execute(input) {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      input.timeout_ms ?? 5000
    );

    try {
      const response = await fetch(input.url, {
        method: "HEAD",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      return {
        status_code: response.status,
        response_time_ms: Date.now() - start,
        error: null,
        checked_at: new Date().toISOString(),
      };
    } catch (e) {
      clearTimeout(timeout);
      return {
        status_code: null,
        response_time_ms: Date.now() - start,
        error: e instanceof Error ? e.message : "Unknown error",
        checked_at: new Date().toISOString(),
      };
    }
  },
};
```

**Step 22: Create examples/uptime-app/.env.example**

```
DATABASE_URL="postgresql://user:password@localhost:5432/uptime_app"
DATABASE_SCHEMA="public"
```

**Step 23: Commit**

```bash
git add examples/uptime-app
git commit -m "feat: add uptime-app example with T3 stack and url-check workflow"
```

---

## Task 9: Add .gitignore

**Files:**
- Create: `.gitignore`

**Step 1: Create .gitignore**

```
# Dependencies
node_modules/

# Build outputs
dist/
.next/
out/

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Test coverage
coverage/

# Turbo
.turbo/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore"
```

---

## Task 10: Install Dependencies and Verify Build

**Step 1: Install dependencies**

Run: `pnpm install`

Expected: Dependencies installed, lockfile created

**Step 2: Build all packages**

Run: `pnpm build`

Expected: All packages build successfully

**Step 3: Run linter**

Run: `pnpm lint`

Expected: No lint errors

**Step 4: Commit lockfile**

```bash
git add pnpm-lock.yaml
git commit -m "chore: add pnpm lockfile"
```

---

## Summary

After completing all tasks, the directory structure will be:

```
crayon/
├── package.json
├── pnpm-workspace.yaml
├── .npmrc
├── biome.json
├── tsconfig.json
├── .gitignore
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types.ts
│   │       └── factory.ts
│   ├── ui/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       └── components/
│   │           ├── WorkflowList.tsx
│   │           └── TriggerButton.tsx
│   └── cli/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts
├── skills/
│   ├── compile-workflow/
│   │   └── SKILL.md
│   └── validate-spec/
│       └── SKILL.md
├── examples/
│   └── uptime-app/                  # T3 stack + crayon
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.js
│       ├── drizzle.config.ts
│       ├── biome.jsonc
│       ├── .env.example
│       │
│       ├── specs/                   # ← crayon workflow/agent specs
│       │   ├── workflows/
│       │   │   └── url-check.md     # URL checking workflow spec
│       │   └── agents/
│       │
│       ├── generated/               # ← crayon compiled output
│       │   └── workflows/
│       │       └── url-check.ts     # Compiled from spec
│       │
│       └── src/
│           ├── env.js
│           ├── nodes/               # ← crayon function nodes
│           ├── tools/               # ← crayon agent tools
│           │
│           ├── server/              # T3 stack server code
│           │   ├── db/
│           │   │   ├── schema.ts
│           │   │   └── index.ts
│           │   └── api/
│           │       ├── trpc.ts
│           │       ├── root.ts
│           │       └── routers/
│           │           └── check.ts # Triggers crayon workflow
│           │
│           ├── trpc/
│           │   ├── react.tsx
│           │   ├── query-client.ts
│           │   └── server.ts
│           │
│           └── app/
│               ├── layout.tsx
│               ├── page.tsx
│               └── api/trpc/[trpc]/route.ts
└── docs/
    └── plans/
```

**Key integration point:** The tRPC router (`check.ts`) triggers crayon workflows. The workflow spec (`specs/workflows/url-check.md`) defines the URL checking logic, which compiles to `generated/workflows/url-check.ts`.
