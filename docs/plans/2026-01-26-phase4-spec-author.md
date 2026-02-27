# Phase 4: Spec Author Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Claude Code skill that guides users through collaborative workflow design, turning vague workflow ideas into well-structured specs.

**Architecture:** A single SKILL.md file in `skills/spec-author/` that implements a guided dialogue flow. The skill reads existing specs for context and outputs validated specs to `specs/workflows/` with agent stubs in `specs/agents/`.

**Tech Stack:** Markdown skill file (Claude Code skill format)

---

## Task 1: Create Spec Author Skill

**Files:**
- Create: `skills/spec-author/SKILL.md`

**Step 1: Create the skill directory**

Run:
```bash
mkdir -p skills/spec-author
```
Expected: Directory created

**Step 2: Write the complete SKILL.md file**

Create `skills/spec-author/SKILL.md` with the following content:

```markdown
---
name: spec-author
description: Collaborative workflow design - guides users through creating well-structured crayon workflow specs
---

# Spec Author

This skill guides you through designing a workflow specification for crayon. We'll work together step-by-step to turn your workflow idea into a well-structured spec that can be compiled into executable code.

**Announce at start:** "I'm using the spec-author skill to help you design a workflow."

---

## Pre-Flight Check

Before starting, perform these checks:

1. **Check directories exist:**
   - If `specs/workflows/` doesn't exist, create it
   - If `specs/agents/` doesn't exist, create it

2. **Read existing context:**
   - Read all files in `specs/workflows/*.md` to understand existing workflows
   - Read all files in `specs/agents/*.md` to know available agents
   - Note what exists so you can suggest reuse

3. **Report context to user:**
   - "Found N existing workflows: [names]"
   - "Found M existing agents: [names]"
   - Or "This appears to be a new project with no existing specs"

---

## Phase 1: Understanding the Workflow Intent

Ask questions ONE AT A TIME. Wait for each answer before asking the next.

### Question 1: Trigger

"What triggers this workflow?"
- A) Webhook from external system (form submission, CRM event, etc.)
- B) Manual trigger with specific input data
- C) Scheduled batch run
- D) Other (please describe)

### Question 2: Goal

"What's the desired outcome when this workflow completes successfully?"

Push for specifics. If the user says "score leads", ask what scoring means - a number? A label? What actions follow?

### Question 3: Systems

"What systems or data sources will this workflow interact with?"
- Company websites (scraping/research)
- CRM (Salesforce, HubSpot)
- Communication (Slack, email)
- Internal database
- External APIs
- Other

### Question 4: Name

Based on answers, propose a name:
- Lowercase with hyphens
- Descriptive of outcome (e.g., `icp-scoring`, `lead-enrichment`)

"I'll name this workflow `<name>`. Does that work?"

---

## Phase 2: Identifying Steps and Nodes

Walk through the workflow step-by-step.

### For each step, ask:

"After [previous step/trigger], what happens next?"

Then determine:

1. **Description** - What does this step do in plain language?

2. **Node type** - Is this:
   - An **agent** task? (needs AI reasoning/judgment)
   - A **function**? (deterministic computation)
   - A **tool** call? (direct API call)

3. **Node selection** - Check if an existing node fits:
   - Existing agents from `specs/agents/`
   - Built-in tools: `web_read`
   - User-defined functions in `src/nodes/`

   If nothing fits, we'll create a new agent or function.

4. **Inputs** - What data does this step need? (from workflow inputs or previous steps)

5. **Outputs** - What variable name holds this step's result?

### For decision points:

When the user describes branching logic, nail down the exact condition:

- BAD: "if it's a good fit"
- GOOD: "if score >= 80"

Ask: "What's the exact condition for this decision?"

### Continue until done:

Keep asking "What happens next?" until the user indicates the workflow is complete.

---

## Phase 3: Presenting and Validating the Spec

Present each section for validation. Wait for approval before proceeding.

### 3.1 Present Inputs

"Here's the **Inputs** section I've captured:"

```markdown
## Inputs

- input_name: type (required|optional, defaults to X) - Description
```

"Does this look right? Any changes?"

### 3.2 Present Steps

"Here are the **Steps**:"

Present each step:

```markdown
### N. Step Name

Description of what this step does.

**Node:** `node-name` (agent|function|tool)
**Input:** var1, var2
**Output:** `result_var`
```

For decision steps:

```markdown
### N. Decision Name

Description of the decision.

**Condition:** `variable.field >= value`
**If true:** continue to step M, set result = "value_a"
**If false:** end workflow, set result = "value_b"
```

"Does this look right? Any changes?"

### 3.3 Present Outputs

"Here's the **Outputs** section:"

```markdown
## Outputs

- output_name: type - Description
```

"Does this look right? Any changes?"

---

## Phase 4: Write the Specs

### 4.1 Write Workflow Spec

Write to `specs/workflows/<name>.md`:

```markdown
---
name: <workflow-name>
version: 1
---

# <Workflow Title>

<One-line description>

## Inputs

<validated inputs>

## Steps

<validated steps with --- separators between each>

## Outputs

<validated outputs>
```

### 4.2 Create Agent Stubs (if needed)

For each NEW agent identified (not existing), create `specs/agents/<name>.md`:

```markdown
---
name: <agent-name>
tools:
  - web_read
---

# <Agent Title>

<Brief description based on the workflow step>

## Task

<What this agent needs to accomplish>

## Guidelines

- Prefer primary sources over aggregators
- If information is unavailable, say so rather than guessing
- Keep output structured and consistent

## Output Format

Return a JSON object with fields:
- field1: description
- field2: description
```

### 4.3 Report Results

Tell the user:

1. "I've written the workflow spec to `specs/workflows/<name>.md`"

2. If new agents created:
   "I've also created agent stub(s) that need to be fleshed out:
   - `specs/agents/<agent1>.md`
   - `specs/agents/<agent2>.md`"

3. "**Next steps:**
   - Review and flesh out any agent stubs (add specific tools, refine prompts)
   - Validate the spec: run `/validate-spec`
   - Compile to TypeScript: run `/compile-workflow`"

---

## Key Principles

1. **One question at a time** - Never ask multiple questions in one message
2. **Concrete over abstract** - Push for specific examples, not vague descriptions
3. **Fail closed** - When ambiguous, ask rather than assume
4. **Leverage existing** - Prefer reusing existing agents/tools
5. **Validate incrementally** - Confirm each section before moving on
6. **Multiple choice preferred** - Offer options when choices are clear

---

## Example Session

```
User: I want to score inbound leads

Agent: I'm using the spec-author skill to help you design a workflow.

[Pre-flight] Found 0 existing workflows. Found 0 existing agents.
This appears to be a new project with no existing specs.

**Question 1:** What triggers this workflow?
- A) Webhook from external system
- B) Manual trigger with specific input data
- C) Scheduled batch run
- D) Other

User: B

Agent: **Question 2:** What information do you have at trigger time?
- A) Just the company URL
- B) Company URL + contact email
- C) Full lead record from CRM
- D) Other

User: A - just the company URL

Agent: **Question 3:** What's a "qualified" lead for you? What criteria determine if a lead is good?

User: B2B SaaS companies with at least $5M ARR

Agent: **Question 4:** What should happen with qualified leads?
- A) Notify sales team (Slack/email)
- B) Create task in CRM
- C) Add to outreach sequence
- D) Multiple actions

User: A - Slack notification

Agent: I'll name this workflow `lead-scoring`. Does that work?

User: Yes

Agent: Let's walk through the steps.

After receiving the company_url, what's the first thing that needs to happen?

User: Research the company

Agent: Got it. This sounds like an **agent** task since it requires judgment about what information is relevant.

I don't see any existing agents that fit. I'll create a new agent called `company-researcher`.

**Step 1: Research Company**
- Gather information about the company
- **Node:** `company-researcher` (agent) - NEW
- **Input:** company_url
- **Output:** `company_data`

What happens after we have the company data?

[... continues until workflow is complete ...]

Agent: Here's the **Inputs** section:

## Inputs
- company_url: string (required) - The company website URL

Does this look right?

User: Yes

Agent: Here are the **Steps**:

### 1. Research Company
Gather comprehensive information about the company...
**Node:** `company-researcher` (agent)
**Input:** company_url
**Output:** `company_data`

---

### 2. Score Against ICP
Evaluate if company matches B2B SaaS $5M+ ARR criteria...
**Node:** `icp-scorer` (agent)
**Input:** company_data
**Output:** `score_result`

---

### 3. Decision
Route based on score.
**Condition:** `score_result.score >= 80`
**If true:** continue to step 4
**If false:** end workflow

---

### 4. Notify Sales
Alert sales team about qualified lead.
**Tool:** `slack_postMessage`
**Input:** channel = "#sales-leads", message with company details

Does this look right?

User: Yes

Agent: Here's the **Outputs** section:

## Outputs
- qualification: "qualified" | "not_qualified"
- score: number
- company_data: object

Does this look right?

User: Yes

Agent: I've written the workflow spec to `specs/workflows/lead-scoring.md`

I've also created agent stubs that need to be fleshed out:
- `specs/agents/company-researcher.md`
- `specs/agents/icp-scorer.md`

**Next steps:**
- Review and flesh out the agent stubs (add specific tools, refine prompts)
- Validate: run `/validate-spec`
- Compile: run `/compile-workflow`
```
```

**Step 3: Verify file was created**

Run:
```bash
cat skills/spec-author/SKILL.md | head -20
```
Expected: Shows frontmatter and beginning of skill

**Step 4: Commit**

```bash
git add skills/spec-author/SKILL.md
git commit -m "feat(skills): add spec-author skill for collaborative workflow design

Phase 4 of MVP implementation. This Claude Code skill guides users
through designing workflow specifications via structured dialogue.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Test the Skill Manually

**Files:**
- None (manual testing)

**Step 1: Verify skill is discoverable**

The skill should be loadable by Claude Code. Test by starting a new conversation and invoking `/spec-author` or asking to design a workflow.

**Step 2: Test with example workflow**

Walk through creating an ICP scoring workflow:
1. Trigger: Manual with company URL
2. Goal: Score and notify sales
3. Verify each phase of the dialogue works

**Step 3: Verify outputs**

Check that:
- Workflow spec is written to `specs/workflows/`
- Agent stubs are created in `specs/agents/`
- Spec follows the format from the design doc

---

## Task 3: Update Documentation

**Files:**
- Modify: `CLAUDE.md:1-50` (add skill reference)

**Step 1: Add spec-author to CLAUDE.md skills section**

Add a brief mention that the spec-author skill exists for designing workflows.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add spec-author skill to CLAUDE.md

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

Phase 4 consists of:

1. **Task 1:** Create the spec-author skill (SKILL.md with full dialogue flow)
2. **Task 2:** Manual testing to verify the skill works
3. **Task 3:** Update documentation

The skill implements:
- Pre-flight context gathering (existing specs/agents)
- Phase 1: Understanding intent (4 questions)
- Phase 2: Step-by-step design (iterative node identification)
- Phase 3: Incremental validation (inputs, steps, outputs)
- Phase 4: Output (write workflow spec + agent stubs)
