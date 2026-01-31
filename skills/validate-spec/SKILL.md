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
   - All tools exist (built-in nodes from 0pflow or user nodes in `src/nodes/`)

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
