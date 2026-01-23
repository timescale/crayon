# 0pflow Design Document

**Date:** 2026-01-23
**Status:** Draft

## Overview

0pflow is an AI-native workflow engine for GTM/RevOps automation.

**Primary users:** GTM engineers, RevOps, and semi-technical operators building research and automation workflows (ICP scoring, expansion research, competitor monitoring).

**Core insight:** Users think in terms of workflows, policies, and outcomes - not state machines, retries, or async control flow. The system meets them where they are.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   User's App Repo                   │
├─────────────────────────────────────────────────────┤
│  specs/                                             │
│    workflows/        ← Workflow specs (markdown)    │
│    agents/           ← Agent definitions (markdown) │
│  src/                                               │
│    nodes/            ← User-written TypeScript      │
│    tools/            ← Tools for agents             │
│  generated/                                         │
│    workflows/        ← Compiled TypeScript (in git) │
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
│   │   │   ├── agent.ts      ← Agent executor
│   │   │   ├── primitives/   ← Built-in tools (web.fetch, etc.)
│   │   │   └── server.ts     ← serve0pflow() with API routes
│   │   └── package.json
│   │
│   ├── ui/                   ← Default UI (@0pflow/ui)
│   │   ├── src/
│   │   │   └── dashboard.tsx ← React components
│   │   └── package.json
│   │
│   └── cli/                  ← CLI tool (@0pflow/cli)
│       └── package.json
│
└── skills/                   ← Claude Code skills
    ├── compile-workflow/
    └── validate-spec/
```

**User's app uses:**
```typescript
import { Workflow, serve0pflow } from '0pflow';
import { dashboard } from '@0pflow/ui';

// Mount API + default UI
app.use('/_0pflow', serve0pflow({ ui: dashboard }));
```

**API routes (provided by core):**
- `GET /api/0pflow/workflows` - List workflows
- `POST /api/0pflow/workflows/:name/trigger` - Trigger a run
- `GET /api/0pflow/workflows/:name` - Get workflow details

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

**Node:** `slack.postMessage` (primitive)
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
- Steps reference nodes by name (agents, functions, primitives)
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
- Built-in primitives (`web.scrape`, `slack.postMessage`)
- User-defined functions from `src/tools/`
- MCP server tools (post-MVP)

## Node Types

Workflows orchestrate nodes. Node types:

| Type | Definition | Example |
|------|------------|---------|
| **Agent** | Markdown spec (system prompt + tools) | `company-researcher` |
| **Function** | User TypeScript in `src/nodes/` | `calculateScore` |
| **Primitive** | Built-in side effect | `slack.postMessage`, `web.fetch` |
| **Sub-workflow** | Another workflow spec | `enrichment-pipeline` |

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
      await ctx.call('slack.postMessage', {
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
- `ctx.runAgent(name, inputs)` - Run an agent node
- `ctx.runNode(name, inputs)` - Run a TypeScript function node
- `ctx.runWorkflow(name, inputs)` - Run a sub-workflow
- `ctx.call(primitive, params)` - Call a built-in primitive
- `ctx.log(message)` - Structured logging

DBOS handles: retries, idempotency, checkpointing, replay.

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
| **SDK** | `ctx.runAgent`, `ctx.runNode`, `ctx.call`, `ctx.log` |
| **Runtime** | DBOS-backed execution, local only |
| **Agents** | Basic agent runner (system prompt + tools) |
| **Tools** | 2-3 built-in primitives (web.fetch, http.post) |
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

---

## MVP Implementation Plan

### Phase 1: Project Scaffolding
- Initialize monorepo structure
- Set up TypeScript, DBOS dependencies
- Create example app repo structure (`specs/`, `src/`, `generated/`)

### Phase 2: SDK Core
- Define `Workflow.create()` API
- Implement `WorkflowContext` with core methods
- Wire up DBOS for durability
- Basic workflow registration and discovery

### Phase 3: Agent Runtime
- Agent executor (takes system prompt + tools, runs LLM)
- Tool calling loop with basic tool interface
- 2-3 built-in primitives (`web.fetch`, `http.post`)

### Phase 4: Compiler (Claude Code Skill)
- Spec parser (extract structure from markdown)
- Code generator (emit TypeScript from parsed spec)
- TODO emission for ambiguous specs
- Sync detection (spec ↔ code drift)

### Phase 5: Validator (Claude Code Skill)
- Structure validation (required sections present)
- Reference validation (nodes exist, types align)
- Human description ↔ implementation consistency check

### Phase 6: Minimal UI
- List workflows from `generated/` directory
- Trigger button → calls webhook
- Display webhook URL for external triggers

### Phase 7: CLI
- `0pflow run <workflow> --input '{...}'`
- `0pflow list`
- `0pflow compile` (manually invoke compiler)

---

## Future Considerations (Post-MVP)

- Security policies in workflow specs (tool access, PII redaction)
- Run history and traces UI
- Scheduled and event-driven triggers
- Multi-provider deployment (Vercel, Render, Fly.io)
- CRM integrations (Salesforce, HubSpot)
- MCP tool server support
- Approval nodes with human-in-the-loop
- MCP server to inspect workflow runs from Claude Code
