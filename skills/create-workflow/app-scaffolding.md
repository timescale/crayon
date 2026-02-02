# App Scaffolding Instructions

When starting a new 0pflow project from scratch, use the `mcp__0pflow-local-tools__create_app` MCP tool to scaffold the app before creating workflows.

## Pre-Flight Check

Before scaffolding, verify:
1. The target directory is empty or doesn't exist yet
2. Ask the user for an app name (lowercase, hyphens, e.g., `lead-scoring-app`)

## Step 1: Database Setup

Ask the user: "Do you want to create a new Tiger Cloud database, or use an existing one?"

**If creating new:**

Use the `mcp__0pflow-local-tools__create_database` MCP tool to provision a new Timescale Cloud database:

```
mcp__0pflow-local-tools__create_database()
```

Store the returned `service_id` - you'll need it later for database migrations and the app's `.env` configuration.

**If using existing:**

Ask for the `service_id` of the existing Tiger Cloud database. You can list available databases with `mcp__tiger__service_list` if the user needs help finding it.

## Step 2: Create App with mcp__0pflow-local-tools__create_app Tool

Call the `mcp__0pflow-local-tools__create_app` MCP tool with the following parameters:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `app_name` | Yes | Application name (lowercase with hyphens, guess from the directory name or ask the user) |
| `install_deps` | No | Run npm install (default: true) |

**Example:**
```
mcp__0pflow-local-tools__create_app(
  app_name: "lead-scoring-app",
  install_deps: true
)
```

## Step 3: Setup Database Schema

Once the database is ready (poll with `mcp__tiger__service_get` if needed), use `mcp__0pflow-local-tools__setup_app_schema` to configure the database connection:

```
mcp__0pflow-local-tools__setup_app_schema(
  application_directory: "<app_name>",
  service_id: "<service_id from step 1>",
  app_name: "<app_name with underscores, e.g., lead_scoring_app>"
)
```

This tool:
- Creates a PostgreSQL user and schema named after the app
- Writes `DATABASE_URL` and `DATABASE_SCHEMA` to the app's `.env` file
- Sets up proper permissions and search paths

**Note:** The `app_name` parameter must be lowercase with underscores (not hyphens) for PostgreSQL compatibility.

## What the Tools Create

The tools scaffold a T3 Stack application with 0pflow directories:

```
<app_name>/
├── src/                    # Next.js app (App Router)
│   ├── app/               # Routes and pages
│   ├── server/            # tRPC routers, Drizzle schema
│   └── trpc/              # tRPC client setup
├── specs/
│   ├── workflows/         # Workflow specifications
│   └── agents/            # Agent definitions
├── generated/
│   └── workflows/         # Compiled TypeScript workflows
├── nodes/                 # Custom node implementations
├── tools/                 # Custom tools for agents
├── agents/                # Agent implementations
├── package.json           # With app_name substituted
└── ...                    # Other T3 config files
```

## After Scaffolding

1. The tool returns the absolute path to the created app
2. Announce to the user: "App scaffolded at `<path>` with database configured."
3. Change into the app directory if needed
4. **Return to SKILL.md and continue from step 5 (Report Context and Announce)** - this includes:
   - Reporting context ("Found 0 existing workflows...")
   - Saying "I'm using the create-workflow skill..." announcement
   - Proceeding to Phase 1 questions

## Template Variables

The following Handlebars variables are substituted in template files:

- `{{app_name}}` - The app name
