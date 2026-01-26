# 0pflow Design Document

**Date:** 2026-01-23
**Status:** Draft

## Overview

0pflow is an AI-native workflow engine for GTM/RevOps automation.

**Primary users:** GTM engineers, RevOps, and semi-technical operators building research and automation workflows (ICP scoring, expansion research, competitor monitoring).

**Core insight:** Users think in terms of workflows, policies, and outcomes - not state machines, retries, or async control flow. The system meets them where they are.

## User App Scaffolding

User apps are standard T3-stack apps (Next.js 16, tRPC, Drizzle, PostgreSQL, better-auth). 0pflow adds specific directories for specs, nodes, and generated code.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│          User's App (T3 Stack: Next.js + tRPC)      │
├─────────────────────────────────────────────────────┤
│  specs/                  ← 0pflow additions         │
│    workflows/            ← Workflow specs (markdown)│
│    agents/               ← Agent definitions        │
│  src/                                               │
│    nodes/                ← Workflow node functions  │
│    tools/                ← Tools for agents         │
│    ... (standard Next.js app structure)            │
│  generated/                                         │
│    workflows/            ← Compiled TS (in git)     │
└─────────────────────────────────────────────────────┘
```

**Flow:**
1. User authors/edits workflow spec with Claude Code
2. Compiler generates TypeScript orchestration code
3. DBOS runtime executes durably
4. User iterates by editing **either** spec or generated code
5. Claude Code agents keep spec ↔ code in sync

**Key principle:** Specs and generated code are synchronized artifacts. Claude Code maintains consistency. Users can edit whichever is more natural for the change.

## Package Structure

```
0pflow/
├── packages/
│   ├── core/                 ← SDK + runtime (0pflow)
│   │   ├── src/
│   │   │   ├── workflow.ts   ← Workflow.create(), WorkflowContext
│   │   │   ├── agent-node.ts ← Pre-packaged agent node (Vercel AI SDK)
│   │   │   ├── tools/        ← Built-in tools (web.fetch, etc.)
│   │   │   ├── discovery.ts  ← Workflow discovery from generated/
│   │   │   └── api.ts        ← Plain functions: listWorkflows, triggerWorkflow, etc.
│   │   └── package.json
│   │
│   ├── ui/                   ← Default UI (@0pflow/ui)
│   │   ├── src/
│   │   │   └── dashboard.tsx ← React components (fetch via props/hooks)
│   │   └── package.json
│   │
│   └── cli/                  ← CLI tool (@0pflow/cli)
│       └── package.json
│
└── skills/                   ← Claude Code skills
    ├── compile-workflow/
    └── validate-spec/
```

**Core SDK API (plain TypeScript functions, no framework dependencies):**

```typescript
import { create0pflow } from '0pflow';

// Create instance at app startup (configures DBOS, discovers workflows)
const pflow = await create0pflow({ workflowDir: './generated/workflows' });

// Use anywhere server-side
const workflows = await pflow.listWorkflows();
const result = await pflow.triggerWorkflow('icp-scoring', { company_url: '...' });
```

**User integration:** Users wrap these methods in tRPC routers, REST API routes, or call directly from server components. 0pflow doesn't prescribe how - it's a library, not a framework.

**Webhook triggers:** For external systems to trigger workflows, users create a REST endpoint in their app that calls `pflow.triggerWorkflow()`. Example: `POST /api/workflows/[name]/trigger`.

## Workflow Spec Format

Workflow specs are structured markdown with minimal frontmatter.

```markdown
---
name: icp-scoring
version: 1
---

# ICP Scoring Workflow

Score inbound companies against our Ideal Customer Profile.

## Inputs
- company_url: string (required) - The company's website URL
- scoring_criteria: string (optional, defaults to "B2B SaaS $5M+ ARR")

## Steps

### 1. Research Company

Gather comprehensive information about the company including
their product, market, team size, funding, and tech stack.

**Node:** `company-researcher` (agent)
**Input:** company_url
**Output:** `company_data`

---

### 2. Score Against ICP

Evaluate whether this company matches our ideal customer profile
based on the criteria provided.

**Node:** `icp-scorer` (agent)
**Input:** company_data, scoring_criteria
**Output:** `score_result`

---

### 3. Decision

Route qualified leads (score >= 80) to sales notification.
Reject others without further action.

**Condition:** `score_result.score >= 80`
**If true:** continue to step 4, set qualification = "qualified"
**If false:** end workflow, set qualification = "not_qualified"

---

### 4. Notify Sales

Alert the sales team about the qualified lead.

**Tool:** `slack.postMessage`
**Input:** channel = "#sales-leads", text = "New qualified lead: {company_data.name} (score: {score_result.score})"

## Outputs
- qualification: "qualified" | "not_qualified"
- score: number
- company_data: object
```

**Structure conventions:**
- `## Inputs` - Typed parameters
- `## Steps` - Numbered steps, each with:
  - Human-readable description (intent)
  - Structured fields (implementation details)
- `## Outputs` - What the workflow returns
- Steps reference nodes by name (agents, functions, tools)
- Control flow expressed in natural language

## Agent Definition Format

Agents are defined in markdown with frontmatter specifying their tools.

```markdown
---
name: company-researcher
tools:
  - web.scrape
  - web.search
  - linkedin.getCompanyProfile
  - clearbit.enrich
---

# Company Researcher

You are a research assistant that gathers comprehensive information
about companies for sales qualification.

## Task

Given a company URL, research and return:
- Company name and description
- Product/service offering
- Target market and customers
- Team size and key people
- Funding status and investors (if available)
- Tech stack (if detectable)

## Guidelines

- Prefer primary sources (company website, LinkedIn) over aggregators
- If information is unavailable, say so rather than guessing
- Include confidence levels for inferred data
- Keep output structured and consistent

## Output Format

Return a JSON object with fields:
- name, description, product, market, team_size,
- funding, tech_stack, confidence_notes
```

**Structure:**
- **Frontmatter:** name + tools available to this agent
- **Body:** system prompt (task, guidelines, output format)

**Tools can be:**
- Built-in tools (`web.fetch`, `http.post`, `slack.postMessage`) - ship with 0pflow
- User-defined tools from `src/tools/` - resolved by convention (e.g., `linkedin.getCompanyProfile` → `src/tools/linkedin/getCompanyProfile.ts`)
- MCP server tools (post-MVP)

## Node Types

Workflows orchestrate nodes. Node types:

| Type | Definition | Example |
|------|------------|---------|
| **Agent** | Markdown spec (system prompt + tools), executed by pre-packaged agent node | `company-researcher` |
| **Function** | User TypeScript in `src/nodes/` | `calculateScore` |
| **Sub-workflow** | Another workflow spec | `enrichment-pipeline` |

**Agent execution model:** Agents are not special runtime machinery. The pre-packaged agent node reads agent specs (`specs/agents/*.md`) at runtime and executes an agentic loop using the Vercel AI SDK. Users can also write custom agent nodes in `src/nodes/` if they need different behavior (e.g., different LLM providers, custom tool-calling logic).

**Tool resolution:** Tools referenced in agent specs (and workflows) are resolved by convention:
- **User-defined tools:** `src/tools/web/scrape.ts` → referenced as `web.scrape`
- **Built-in tools:** `web.fetch`, `http.post`, `slack.postMessage` ship with 0pflow

## Runtime & SDK

The runtime executes compiled TypeScript workflows using DBOS for durability.

**SDK surface (intentionally minimal):**

```typescript
import { Workflow, WorkflowContext } from '0pflow';

export const icpScoring = Workflow.create({
  name: 'icp-scoring',
  version: 1,

  async run(ctx: WorkflowContext, inputs: IcpScoringInputs) {
    // Step 1: Research Company
    const companyData = await ctx.runAgent('company-researcher', {
      company_url: inputs.company_url,
    });

    // Step 2: Score Against ICP
    const scoreResult = await ctx.runAgent('icp-scorer', {
      company_data: companyData,
      scoring_criteria: inputs.scoring_criteria ?? 'B2B SaaS $5M+ ARR',
    });

    // Step 3: Decision
    if (scoreResult.score >= 80) {
      // Step 4: Notify Sales
      await ctx.callTool('slack.postMessage', {
        channel: '#sales-leads',
        text: `New qualified lead: ${companyData.name} (score: ${scoreResult.score})`,
      });
      return { qualification: 'qualified', score: scoreResult.score, companyData };
    }

    return { qualification: 'not_qualified', score: scoreResult.score, companyData };
  },
});
```

**Core SDK methods:**
- `ctx.runAgent(name, inputs)` - Run an agent node (internally calls the pre-packaged agent node)
- `ctx.runNode(name, inputs)` - Run a TypeScript function node
- `ctx.runWorkflow(name, inputs)` - Run a sub-workflow
- `ctx.callTool(name, params)` - Call a tool (built-in or user-defined)
- `ctx.log(message, level?)` - Structured logging (wrapper over `DBOS.logger`, decoupled for future flexibility)

DBOS handles: retries, idempotency, checkpointing, replay.

**Note on caching:** DBOS provides durability (step results persisted for recovery) but not semantic caching (e.g., "don't re-research company X if we did it yesterday"). Semantic caching is user responsibility - implement in tool functions as needed.

## Compiler Behavior

The compiler (Claude Code) transforms workflow specs into TypeScript.

**Compiler principles:**

1. **No invention** - Only emit code that directly maps to spec
2. **Fail closed** - Missing info → TODO comments + build failure, not guesses
3. **Deterministic** - Same spec → same output (modulo formatting)
4. **Readable output** - Generated code should be understandable

**Ambiguity handling:**

```markdown
### 3. Check if good fit
See if they match what we're looking for.
```

Compiles to:

```typescript
// Step 3: Check if good fit
// TODO: Criteria for "good fit" not specified
// TODO: "what we're looking for" is undefined - specify ICP criteria
// UNRESOLVED: This step cannot be compiled until TODOs are addressed
throw new WorkflowCompilationError('Unresolved TODOs in step 3');
```

**Validation checks:**
- All referenced nodes exist (`company-researcher` is defined)
- Inputs/outputs type-align between steps
- No unreachable steps
- No undefined variables

**Sync behavior (when editing generated code):**
- Claude Code detects drift between spec and code
- Offers to update spec to match code changes
- Or regenerate code from spec (user chooses)

## Minimal UI (MVP)

For MVP, the UI is extremely minimal.

**MVP UI scope:**
- List of workflows (name, version, status)
- Manual trigger button (or webhook URL)

```
┌─────────────────────────────────────────────────────┐
│  0pflow                                             │
├─────────────────────────────────────────────────────┤
│  Workflows                                          │
│  ┌─────────────────────────────────────────────────┐│
│  │ icp-scoring (v1)              [Trigger] [Copy URL]││
│  │ expansion-finder (v1)         [Trigger] [Copy URL]││
│  │ competitor-monitor (v1)       [Trigger] [Copy URL]││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**Not in MVP:**
- Run history
- Step-by-step traces
- Agent conversation logs
- Output viewer
- Editing specs in browser

**Trigger options (MVP):**
- Button click in UI
- Webhook POST with JSON body
- CLI: `0pflow run icp-scoring --input '{"company_url": "..."}'`

---

## MVP Scope

### In MVP

| Component | What's Included |
|-----------|-----------------|
| **Spec format** | Workflow specs + agent specs (markdown) |
| **Compiler** | Claude Code skill that generates TypeScript from specs |
| **Validator** | Claude Code skill that checks spec structure |
| **SDK** | `ctx.runAgent`, `ctx.runNode`, `ctx.callTool`, `ctx.log` |
| **Runtime** | DBOS-backed execution, local only |
| **Agents** | Pre-packaged agent node (Vercel AI SDK, reads specs from `specs/agents/`) |
| **Tools** | Built-in tools: `web.fetch`, `http.post`, `slack.postMessage` |
| **UI** | Workflow list + trigger button |
| **Triggers** | Manual (UI button, webhook, CLI) |

### Not in MVP

| Deferred | Reason |
|----------|--------|
| Security policies (tool access, PII redaction) | Complexity |
| Run history / traces UI | Can use logs for now |
| Scheduled / event-driven triggers | Manual is enough to validate |
| Multi-provider deployment | Local first |
| CRM integrations | Output to UI only |
| MCP tool servers | User-defined tools are enough |
| Approval nodes (`ctx.requestApproval`) | Add when needed |
| Resumable/incremental workflows | Full runs only for MVP; users compose smaller workflows if needed |
| Built-in semantic caching | User responsibility; implement in tool functions |

---

## MVP Implementation Plan

### Phase 1: Project Scaffolding
- Initialize monorepo structure for 0pflow packages
- Set up TypeScript, DBOS dependencies
- Create example user app based on T3 scaffolding (Next.js 16, tRPC, Drizzle, better-auth)
- Add `specs/workflows/`, `specs/agents/`, `src/nodes/`, `src/tools/`, `generated/workflows/` to example app

### Phase 2: SDK Core
- `create0pflow()` factory - returns instance with config (workflow dir, DBOS setup)
- `Workflow.create()` API for defining workflows
- `WorkflowContext` with core methods (`runAgent`, `runNode`, `call`, `log`)
- Workflow discovery from `generated/workflows/`
- Instance methods: `listWorkflows()`, `getWorkflow()`, `triggerWorkflow()`

### Phase 3: Agent Node + Tools
- Pre-packaged agent node using Vercel AI SDK (reads agent specs, runs agentic loop)
- Tool interface for user-defined tools (`src/tools/`)
- Built-in tools (`web.fetch`, `http.post`, `slack.postMessage`)

### Phase 4: Compiler (Claude Code Skill)
- Spec parser (extract structure from markdown)
- Code generator (emit TypeScript from parsed spec)
- TODO emission for ambiguous specs
- Sync detection (spec ↔ code drift)

### Phase 5: Validator (Claude Code Skill)
- Structure validation (required sections present)
- Reference validation (nodes exist, types align)
- Human description ↔ implementation consistency check

### Phase 6: Minimal UI (@0pflow/ui)
- React components that accept data via props (framework-agnostic)
- WorkflowList, WorkflowTriggerButton components
- User wires up data fetching (tRPC, SWR, etc.) in their app
- Example integration provided in docs

### Phase 7: CLI
- `0pflow run <workflow> --input '{...}'`
- `0pflow list`
- `0pflow compile` (manually invoke compiler)

---

## Future Considerations (Post-MVP)

- **Resumable/incremental workflows** - Trigger workflows from a specific step, not just start-to-finish (DBOS has `forkWorkflow` primitive)
- Security policies in workflow specs (tool access, PII redaction)
- Run history and traces UI
- Scheduled and event-driven triggers
- Multi-provider deployment (Vercel, Render, Fly.io)
- CRM integrations (Salesforce, HubSpot)
- MCP tool server support
- Approval nodes with human-in-the-loop
- MCP server to inspect workflow runs from Claude Code
