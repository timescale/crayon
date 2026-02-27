# crayon Design Document

**Date:** 2026-01-23
**Status:** In Progress

## Implementation Progress

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | Project Scaffolding | Done |
| 2 | SDK Core | Done |
| 3 | Agent Node + Nodes | Done |
| 4 | Spec Author (Claude Code Skill) | Done |
| 5 | Compiler (Claude Code Skill) | Done |
| 6 | CLI | Done |
| 7 | Validator (Claude Code Skill) | Not Started |
| 8 | Minimal UI (@crayon/ui) | Not Started |

## Overview

crayon is an AI-native workflow engine for GTM/RevOps automation.

**Primary users:** GTM engineers, RevOps, and semi-technical operators building research and automation workflows (ICP scoring, expansion research, competitor monitoring).

**Core insight:** Users think in terms of workflows, policies, and outcomes - not state machines, retries, or async control flow. The system meets them where they are.

## User App Scaffolding

User apps are standard T3-stack apps (Next.js 16, tRPC, Drizzle, PostgreSQL, better-auth). crayon adds specific directories for specs, nodes, and generated code.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│          User's App (T3 Stack: Next.js + tRPC)      │
├─────────────────────────────────────────────────────┤
│  specs/                  ← crayon additions         │
│    workflows/            ← Workflow specs (markdown)│
│    agents/               ← Agent definitions        │
│  src/                                               │
│    nodes/                ← User-defined nodes       │
│    ... (standard Next.js app structure)            │
│  generated/                                         │
│    workflows/            ← Compiled TS (in git)     │
└─────────────────────────────────────────────────────┘
```

**Flow:**
1. User describes workflow intent using Claude Code skill (spec-author)
2. Skill guides user through collaborative design → outputs workflow spec
3. Compiler generates TypeScript orchestration code
4. DBOS runtime executes durably
5. User iterates by re-running spec-author or editing spec directly

**Key principle:** Specs are the source of truth. Generated code is derived from specs via compilation. For MVP, only spec→code compilation is supported.

## Package Structure

```
crayon/
├── packages/
│   ├── core/                 ← SDK + runtime (crayon)
│   │   ├── src/
│   │   │   ├── workflow.ts   ← Workflow.create(), WorkflowContext
│   │   │   ├── node.ts       ← Node.create()
│   │   │   ├── agent.ts      ← Agent.create()
│   │   │   ├── nodes/        ← Built-in nodes, registry, agent internals
│   │   │   └── factory.ts    ← createCrayon()
│   │   └── package.json
│   │
│   ├── ui/                   ← Default UI (@crayon/ui)
│   │   ├── src/
│   │   │   └── dashboard.tsx ← React components (fetch via props/hooks)
│   │   └── package.json
│   │
│   └── cli/                  ← CLI tool (@crayon/cli)
│       └── package.json
│
└── skills/                   ← Claude Code skills
    ├── spec-author/          ← Collaborative spec design
    ├── compile-workflow/
    └── validate-spec/
```

**Core SDK API (plain TypeScript functions, no framework dependencies):**

```typescript
import { createCrayon } from 'crayon';

// Create instance at app startup (configures DBOS, discovers workflows)
const crayon = await createCrayon({ workflowDir: './generated/workflows' });

// Use anywhere server-side
const workflows = await crayon.listWorkflows();
const result = await crayon.triggerWorkflow('icp-scoring', { company_url: '...' });
```

**User integration:** Users wrap these methods in tRPC routers, REST API routes, or call directly from server components. crayon doesn't prescribe how - it's a library, not a framework.

**Webhook triggers:** For external systems to trigger workflows, users create a REST endpoint in their app that calls `crayon.triggerWorkflow()`. Example: `POST /api/workflows/[name]/trigger`.

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

## Tasks

### 1. Research Company

Gather comprehensive information about the company including
their product, market, team size, funding, and tech stack.

**Node:** `company-researcher` (agent)
**Input:** company_url
**Output:** `company_data: { name: string, description: string, product: string, market: string, team_size?: number, funding?: string, tech_stack?: string[] }`

---

### 2. Score Against ICP

Evaluate whether this company matches our ideal customer profile
based on the criteria provided.

**Node:** `icp-scorer` (agent)
**Input:** company_data, scoring_criteria
**Output:** `score_result: { score: number, reasons: string[] }`

---

### 3. Decision

Route qualified leads (score >= 80) to sales notification.
Reject others without further action.

**Condition:** `score_result.score >= 80`
**If true:** continue to task 4
**If false:** return:
  - qualification: "not_qualified"
  - score: score_result.score
  - company_data: company_data

---

### 4. Notify Sales

Alert the sales team about the qualified lead.

**Tool:** `slack_postMessage`
**Input:** channel = "#sales-leads", text = "New qualified lead: {company_data.name} (score: {score_result.score})"
**Return:**
  - qualification: "qualified"
  - score: score_result.score
  - company_data: company_data

## Outputs (optional)
- qualification: "qualified" | "not_qualified"
- score: number
- company_data: { name: string, description: string, product: string, market: string, team_size?: number, funding?: string, tech_stack?: string[] }
```

**Structure conventions:**
- `## Inputs` - Typed parameters
- `## Tasks` - Numbered tasks, each with:
  - Human-readable description (intent)
  - Structured fields (implementation details)
- `## Outputs` (optional) - What the workflow returns (always an object with named fields)
- Tasks reference nodes by name (agents, user-defined nodes, built-in nodes)
- Control flow expressed in natural language

## Agent Definition Format

Agents are defined in markdown with frontmatter specifying their tools.

```markdown
---
name: company-researcher
tools:
  - web.scrape
  - web.search
  - linkedin_getCompanyProfile
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
- Built-in nodes (`web_read`) - ship with crayon
- User-defined nodes from `src/nodes/` - resolved by convention

**Node naming convention:** Node names must use underscores, not dots (e.g., `web_read` not `http.get`). This ensures compatibility with all LLM providers.
- MCP server tools (post-MVP)

## Node Types

Workflows orchestrate nodes. Node types:

| Type | Definition | Example |
|------|------------|---------|
| **Agent** | Markdown spec (system prompt + tools), executed by pre-packaged agent node | `company-researcher` |
| **Node** | User TypeScript in `src/nodes/` | `calculateScore` |
| **Sub-workflow** | Another workflow spec | `enrichment-pipeline` |

**Unified node model:** Tools and function nodes are unified into a single concept: nodes. All nodes have a `description` field which allows them to be used as agent tools. Built-in nodes like `web_read` ship with crayon; user-defined nodes live in `src/nodes/`.

**Agent execution model:** Agents are not special runtime machinery. The pre-packaged agent node reads agent specs (`specs/agents/*.md`) at runtime and executes an agentic loop using the Vercel AI SDK. Users can also write custom agent nodes in `src/nodes/` if they need different behavior (e.g., different LLM providers, custom tool-calling logic).

**Node resolution:** Nodes referenced in agent specs (as tools) and workflows are resolved by convention:
- **User-defined nodes:** `src/nodes/<name>.ts`
- **Built-in nodes:** `web_read` ships with crayon

## Runtime & SDK

The runtime executes compiled TypeScript workflows using DBOS for durability.

**SDK surface (intentionally minimal):**

```typescript
import { Workflow, WorkflowContext } from 'crayon';

export const icpScoring = Workflow.create({
  name: 'icp-scoring',
  version: 1,

  async run(ctx: WorkflowContext, inputs: IcpScoringInputs) {
    // Task 1: Research Company
    const companyData = await ctx.runAgent('company-researcher', {
      company_url: inputs.company_url,
    });

    // Task 2: Score Against ICP
    const scoreResult = await ctx.runAgent('icp-scorer', {
      company_data: companyData,
      scoring_criteria: inputs.scoring_criteria ?? 'B2B SaaS $5M+ ARR',
    });

    // Task 3: Decision
    if (scoreResult.score >= 80) {
      // Task 4: Notify Sales
      await ctx.callTool('slack_postMessage', {
        channel: '#sales-leads',
        text: `New qualified lead: ${companyData.name} (score: ${scoreResult.score})`,
      });
      return { qualification: 'qualified', score: scoreResult.score, company_data: companyData };
    }

    return { qualification: 'not_qualified', score: scoreResult.score, company_data: companyData };
  },
});
```

**Core SDK methods:**
- `ctx.run(executable, inputs)` - Run any executable (node, agent, or workflow)
- `ctx.log(message, level?)` - Structured logging (wrapper over `DBOS.logger`, decoupled for future flexibility)

**Note:** The unified `ctx.run()` method accepts any `Executable` (nodes, agents, workflows). Nodes and agents are created with `Node.create()` and `Agent.create()` respectively, both requiring a `description` field which enables nodes to be used as agent tools.

DBOS handles: retries, idempotency, checkpointing, replay.

**Note on caching:** DBOS provides durability (task results persisted for recovery) but not semantic caching (e.g., "don't re-research company X if we did it yesterday"). Semantic caching is user responsibility - implement in tool functions as needed.

## Idempotency & Attempt Semantics (Post-MVP)

crayon distinguishes between idempotent and non-idempotent nodes to determine how retries and recovery are handled. This distinction affects how `maxAttempts` is interpreted and enforced.

**MVP behavior:** All nodes are treated as idempotent. Non-idempotent semantics are deferred to post-MVP.

### Idempotent Nodes (Default)

A node is idempotent if re-executing it with the same inputs does not change the final external state.

**Examples:**
- Pure computation
- Deterministic data transformation
- Upserts by stable key
- "Set state to X" operations
- API calls that support idempotency keys

**Attempt semantics (completion-based):**
- An attempt is counted when the node execution reaches a terminal outcome (success or failure)
- If execution is interrupted (process crash, restart) before completion, the node may be re-executed without consuming an attempt
- The runtime may freely re-execute idempotent nodes during recovery
- At most `maxAttempts` completed executions are allowed

**Rationale:** Idempotent work is safe to re-run, so durability and retry limits are based on completed executions.

### Non-Idempotent Nodes (Post-MVP)

A node is non-idempotent if re-execution may produce duplicate or unintended side effects.

**Examples:**
- Posting a Slack message
- Sending an email
- Appending a CRM note
- Emitting a webhook without a deduplication key

Non-idempotent nodes must explicitly declare `idempotency: non-idempotent`.

**Attempt semantics (start-based):**
- An attempt is counted when execution is started, recorded in a durable crayon attempt ledger
- Each execution start consumes one attempt, regardless of whether it completes
- On recovery, previously started but incomplete attempts are not replayed
- The engine will start execution at most `maxAttempts` times for a given `(runId, nodeId)` unless explicitly forced
- If all attempts are exhausted without a confirmed completion, the node resolves to a terminal failure or `UNKNOWN` state

**Rationale:** Non-idempotent work must strictly bound how many times it is initiated, since re-execution may duplicate side effects.

### Invariant

For each workflow run and node instance `(runId, nodeId)`:
- **Idempotent nodes:** at most `maxAttempts` completed executions
- **Non-idempotent nodes:** at most `maxAttempts` execution starts

### Defaults & Validation (Post-MVP)

- Nodes are assumed idempotent by default
- Built-in tools have explicit idempotency metadata (e.g., `slack_postMessage` defaults to non-idempotent)
- The compiler fails closed if a non-idempotent tool is used without declaring idempotency
- `maxAttempts` applies uniformly to all nodes; only the counting semantics differ

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
// Task 3: Check if good fit
// TODO: Criteria for "good fit" not specified
// TODO: "what we're looking for" is undefined - specify ICP criteria
// UNRESOLVED: This task cannot be compiled until TODOs are addressed
throw new WorkflowCompilationError('Unresolved TODOs in task 3');
```

**Validation checks:**
- All referenced nodes exist (`company-researcher` is defined)
- Inputs/outputs type-align between tasks
- No unreachable tasks
- No undefined variables

**One-way compilation:** For MVP, compilation is strictly spec→code. Users edit specs and recompile; direct editing of generated code is not supported. The generated code should be treated as a build artifact (though committed to git for transparency).

## Spec Author Skill

The spec-author skill is a Claude Code skill that guides users through collaborative workflow design. It's modeled after brainstorming workflows but focused specifically on creating crayon specs.

**Purpose:** Turn vague workflow ideas into well-structured specs through guided dialogue, ensuring specs are complete enough to compile without ambiguity.

### Process

**1. Understanding the workflow intent:**
- Review existing specs in `specs/workflows/` and `specs/agents/` for context
- Ask questions one at a time to understand the workflow goal
- Prefer multiple choice questions when options are clear
- Focus on: what triggers the workflow, what's the desired outcome, what systems are involved

**2. Identifying tasks and nodes:**
- Walk through the workflow task-by-task
- For each task, determine: is this an agent, a function, or a tool call?
- Propose existing agents/tools that could work, or identify new ones needed
- Clarify inputs/outputs at each task

**3. Handling control flow:**
- Identify decision points (conditionals, branches)
- Clarify criteria for each branch
- Ensure no ambiguous conditions (e.g., "if good fit" → "if score >= 80")

**4. Presenting the spec:**
- Once the workflow is understood, draft the spec incrementally
- Present each section (Inputs, Tasks, Outputs) for validation
- Revise based on feedback before finalizing

**5. Output:**
- Write validated spec to `specs/workflows/<name>.md`
- If new agents are needed, create stubs in `specs/agents/`
- Optionally run the compiler to validate the spec compiles cleanly

### Key Principles

- **One question at a time** - Don't overwhelm users with multiple questions
- **Concrete over abstract** - Ask for specific examples, not general descriptions
- **Fail closed** - If something is ambiguous, ask rather than assume
- **Leverage existing nodes** - Prefer reusing existing agents/tools over creating new ones
- **Validate incrementally** - Check each section before moving on

### Example Dialogue

```
User: I want to score inbound leads

Skill: What triggers this workflow?
  A) Webhook from form submission
  B) Manual trigger with company URL
  C) Scheduled batch from CRM
  D) Other

User: B

Skill: What information do you have at trigger time?
  A) Just the company URL
  B) Company URL + contact email
  C) Full lead record from CRM
  D) Other

User: A

Skill: What's a "good" lead for you? Help me understand your ICP criteria.
  A) B2B SaaS companies with $5M+ ARR
  B) Tech companies with 50+ employees
  C) Custom criteria (I'll describe)
  D) Not sure yet

User: A

Skill: What should happen with qualified leads?
  A) Notify sales team (Slack/email)
  B) Create task in CRM
  C) Add to outreach sequence
  D) Multiple of the above

User: A - Slack notification

Skill: Got it. Here's the workflow structure:

## Inputs
- company_url: string (required)

Does this look right so far?

User: Yes

Skill: ## Tasks

### 1. Research Company
Gather information about the company from their website and public sources.
**Node:** `company-researcher` (agent)
**Output:** `company_data: { name: string, description: string, ... }`

### 2. Score Against ICP
Evaluate against B2B SaaS $5M+ ARR criteria.
**Node:** `icp-scorer` (agent)
**Output:** `score_result: { score: number, reasons: string[] }`

Does this look right?

[continues...]
```

## Minimal UI (MVP)

For MVP, the UI is extremely minimal.

**MVP UI scope:**
- List of workflows (name, version, status)
- Manual trigger button (or webhook URL)

```
┌─────────────────────────────────────────────────────┐
│  crayon                                             │
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
- Task-by-task traces
- Agent conversation logs
- Output viewer
- Editing specs in browser

**Trigger options (MVP):**
- Button click in UI
- Webhook POST with JSON body
- CLI: `crayon run icp-scoring --input '{"company_url": "..."}'`

---

## MVP Scope

### In MVP

| Component | What's Included |
|-----------|-----------------|
| **Spec format** | Workflow specs + agent specs (markdown) |
| **Spec author** | Claude Code skill that guides collaborative spec design |
| **Compiler** | Claude Code skill that generates TypeScript from specs |
| **Validator** | Claude Code skill that checks spec structure |
| **SDK** | `ctx.runAgent`, `ctx.runNode`, `ctx.callTool`, `ctx.log` |
| **Runtime** | DBOS-backed execution, local only |
| **Agents** | Pre-packaged agent node (Vercel AI SDK, reads specs from `specs/agents/`) |
| **Nodes** | Built-in nodes: `web_read`; user-defined nodes in `src/nodes/` |
| **UI** | Workflow list + trigger button |
| **Triggers** | Manual (UI button, webhook, CLI) |

### Not in MVP

| Deferred | Reason |
|----------|--------|
| Code→spec sync (editing generated code) | Spec→code only for MVP; simplifies mental model |
| Security policies (tool access, PII redaction) | Complexity |
| Run history / traces UI | Can use logs for now |
| Scheduled / event-driven triggers | Manual is enough to validate |
| Multi-provider deployment | Local first |
| CRM integrations | Output to UI only |
| MCP tool servers | User-defined tools are enough |
| Approval nodes (`ctx.requestApproval`) | Add when needed |
| Resumable/incremental workflows | Full runs only for MVP; users compose smaller workflows if needed |
| Built-in semantic caching | User responsibility; implement in tool functions |
| Non-idempotent node semantics | All nodes treated as idempotent for MVP; attempt ledger adds complexity |

---

## MVP Implementation Plan

### Phase 1: Project Scaffolding
- Initialize monorepo structure for crayon packages
- Set up TypeScript, DBOS dependencies
- Create example user app based on T3 scaffolding (Next.js 16, tRPC, Drizzle, better-auth)
- Add `specs/workflows/`, `specs/agents/`, `src/nodes/`, `generated/workflows/` to example app

### Phase 2: SDK Core
- `createCrayon()` factory - returns instance with config (workflow dir, DBOS setup)
- `Workflow.create()` API for defining workflows
- `WorkflowContext` with core methods (`runAgent`, `runNode`, `call`, `log`)
- Workflow discovery from `generated/workflows/`
- Instance methods: `listWorkflows()`, `getWorkflow()`, `triggerWorkflow()`

### Phase 3: Agent Node + Nodes
- Pre-packaged agent node using Vercel AI SDK (reads agent specs, runs agentic loop)
- Unified node interface (nodes can be used as workflow steps and agent tools)
- Built-in nodes (`web_read`)

### Phase 4: Spec Author (Claude Code Skill)
- Collaborative dialogue flow for workflow design
- Context awareness (reads existing specs/agents)
- Incremental spec presentation and validation
- Writes validated specs to `specs/workflows/`
- Creates agent stubs when new agents are identified

### Phase 5: Compiler (Claude Code Skill)
- Spec parser (extract structure from markdown)
- Code generator (emit TypeScript from parsed spec)
- TODO emission for ambiguous specs

### Phase 6: CLI
- `crayon run <workflow> --input '{...}'` - trigger a workflow
- `crayon list` - list available workflows
- `crayon runs` - list previous workflow runs
- `crayon runs <run-id>` - get details of a specific run

### Phase 7: Validator (Claude Code Skill)
- Structure validation (required sections present)
- Reference validation (nodes exist, types align)
- Human description ↔ implementation consistency check

### Phase 8: Minimal UI (@crayon/ui)
- React components that accept data via props (framework-agnostic)
- WorkflowList, WorkflowTriggerButton components
- User wires up data fetching (tRPC, SWR, etc.) in their app
- Example integration provided in docs

---

## Future Considerations (Post-MVP)

- **Code→spec sync** - Allow users to edit generated code directly and have Claude Code update the spec to match (bidirectional sync)
- **Resumable/incremental workflows** - Trigger workflows from a specific task, not just start-to-finish (DBOS has `forkWorkflow` primitive)
- Security policies in workflow specs (tool access, PII redaction)
- Run history and traces UI
- Scheduled and event-driven triggers
- Multi-provider deployment (Vercel, Render, Fly.io)
- CRM integrations (Salesforce, HubSpot)
- MCP tool server support
- Additional built-in nodes (`http_post`, `slack_postMessage`)
- Approval nodes with human-in-the-loop
- MCP server to inspect workflow runs from Claude Code
- **Non-idempotent node semantics** - Attempt ledger with start-based counting for tools like `slack_postMessage` that can't safely be re-executed
- **Incremental compilation** - Only compile workflow specs that changed since last compilation (diff-based)
