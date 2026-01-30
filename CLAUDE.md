# 0pflow

AI-native workflow engine for GTM/RevOps automation.

## Project Status

**Status:** Active development - Phase 4 (Spec Author) complete.

**Current Focus:** Building MVP workflow engine with Claude Code skills.

## Claude Code Plugin

This repo is a Claude Code plugin. Load it with:
```bash
claude --plugin-dir /path/to/0pflow
```

### Available Skills

- `/0pflow:create-workflow` - Collaborative workflow design (guides you through creating workflow specs)
- `/0pflow:refine-node` - Refine node definitions (adds tools, guidelines, output formats to nodes)
- `/0pflow:compile-workflow` - Compile workflow specs to TypeScript
- `/0pflow:validate-spec` - Validate spec structure and references
- `/0pflow:integrations` - Generate integration nodes for external APIs (Salesforce, HubSpot, etc.)
- `/0pflow:cli` - Reference for 0pflow CLI commands (list, run, history)

## Key Documents

- `docs/plans/2026-01-23-0pflow-design.md` - Main design document (architecture, SDK API, spec formats, MVP scope)
- `docs/plans/2026-01-23-outreach-automation-example.md` - Reference implementation example

## Architecture Overview

- **Workflow specs** (markdown) → **Compiler** (Claude Code) → **Generated TypeScript** → **DBOS runtime**
- Users write specs, compiler generates code, runtime executes durably
- Specs and generated code stay in sync

## Reference: 0perator Project

The sibling project `/Users/cevian/Development/0perator` has useful patterns to reference:

### Skill System (`/Users/cevian/Development/0perator/skills/`)

- `skills/create-app/SKILL.md` - Multi-phase workflow spec (8 phases with dependencies)
- Markdown format with YAML frontmatter (name, description)
- Good reference for how to structure workflow phases and agent coordination

### Agent Definitions (`/Users/cevian/Development/0perator/agents/`)

- `agents/schema-designer.md` - Agent with tools that reads context and generates output
- `agents/frontend-builder-group.md` - Master agent that spawns parallel sub-agents
- `agents/api-planner.md` - Planning agent that writes to shared docs/plan/ directory
- Pattern: agents read CLAUDE.md for context, write to shared directories for coordination

### MCP Tools (`/Users/cevian/Development/0perator/src/mcp/tools/`)

- `viewSkill.ts` - Loads and parses skill markdown files
- `createDatabase.ts` - Example of an async operation tool with Zod validation
- Pattern: Pure functions with Zod input/output schemas

### Skill Loading (`/Users/cevian/Development/0perator/src/mcp/skillutils/`)

- `loadSkill.ts` - Parses markdown with gray-matter for frontmatter
- `skillTree.ts` - Discovers and lists available skills

### Template System (`/Users/cevian/Development/0perator/templates/app/`)

- Complete T3 Stack starter (Next.js + tRPC + Drizzle + better-auth)
- Could be adapted as the base for 0pflow example apps
- Has proper env validation with Zod (`env.js`)

### CLI Structure (`/Users/cevian/Development/0perator/src/`)

- `index.ts` - Commander.js CLI entry point
- `commands/` - Command implementations
- `config.ts` - Centralized paths and version

### Key Patterns Worth Adopting

1. **Skill format** - Markdown with YAML frontmatter for workflow/agent specs
2. **Tool validation** - Zod schemas for all tool inputs/outputs
3. **Agent coordination** - Agents write to shared directories, read CLAUDE.md for context
4. **Parallelization** - Master agents spawning parallel sub-agents for independent work
