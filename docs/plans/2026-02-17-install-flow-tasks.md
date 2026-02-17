# Install Flow Improvements

Goal: Make the 0pflow signup-to-first-workflow experience smooth for non-technical users.

## Phase 1: Bash Bootstrap Script

The entry point. Non-technical users won't have npm — they need a single command to get started.

### 1. Create `curl | bash` installer script

**New file:** `scripts/install.sh` (or hosted at a URL)

The script should:
1. **Detect OS** (macOS / Linux)
2. **Check for Node.js/npm** — if missing, install via:
   - macOS: `brew install node` (check for Homebrew first, install if needed) or use fnm/nvm
   - Linux: Use fnm/nvm or distro package manager
3. **Check for Claude Code CLI** — if missing, show install link or auto-install
4. **Check for Tiger CLI** — if missing, install it (brew or curl)
5. **Run `npx -y 0pflow@latest install`** with `--loglevel=error`
6. **Print the next command:** `npx -y 0pflow@latest run`

Target UX:
```bash
curl -fsSL https://0pflow.com/install | bash
# ...installs everything...
# Then user runs:
0pflow run
```

Create a shell alias so users can just type `0pflow run`:
```bash
alias 0pflow='npx -y --prefer-online 0pflow@dev'
```
Use `--prefer-online` to ensure npx always re-resolves the `@dev` tag and pulls the latest build. For production, switch to `@latest` once we have a stable release channel.

## Phase 2: Simplified Interface

Reduce the number of commands and decisions the user has to make.

### 2. Merge `install` into `run` (auto-install plugin)

**Files:** `packages/core/src/cli/run.ts`, `packages/core/src/cli/install.ts`

Currently `install` and `run` are separate commands. For non-technical users, this is one extra step to remember.

**Fix:** At the start of `runRun()`, check if the plugin is installed (read `~/.config/0pflow/settings.json`). If not, run the install flow automatically (marketplace add + plugin install). This makes the user journey: bash script → `0pflow run` (which handles everything).

Keep `install` as a standalone command for advanced users, but make it optional.

### 3. Auto-detect Tiger CLI login and trigger auth

**File:** `packages/core/src/cli/run.ts` (new project flow, around database selection)

If the user isn't logged into Tiger Cloud, `tiger service list` and `tiger service create` will fail silently or with cryptic errors.

**Fix:** Before database operations, check Tiger auth status (e.g. `tiger auth status` or try `tiger service list` and check for auth errors). If not authenticated, prompt and run `tiger login` (which opens browser). This removes a hidden prerequisite.

### 4. Default project directory to `~/0pflow/<name>`

**File:** `packages/core/src/cli/run.ts:263-304`

Currently asks user to pick between cwd and a custom path. Non-technical users don't want to think about filesystems.

**Fix:** Change the default to `~/0pflow/<projectName>`. Create `~/0pflow/` if it doesn't exist. Still offer "Other directory" as an option for power users, but the default should just work without any cd/mkdir. Remove the "Here" option (or make it secondary) since running from a random terminal location shouldn't be the default.

### 5. Suppress npm engine warnings

**File:** `packages/core/src/cli/run.ts:442` and wherever `npm install` is invoked

The EBADENGINE warnings about node version are noisy and alarming to non-technical users.

**Fix:** Add `--loglevel=error` to npm install commands to suppress warnings. Also consider pinning or documenting the minimum Node.js version in the bash bootstrap script.

## Phase 3: Robustness Fixes

Fix crashes and dead-ends in the setup flow.

### 6. Don't offer launch when schema setup failed

**File:** `packages/core/src/cli/run.ts:501-515`

Currently, after schema setup fails, the code still asks "Launch now?" — if the user says Yes, `getAppSchema()` throws and the process crashes with a raw stack trace.

**Fix:** Skip the launch prompt (or only offer "retry schema" / "exit") when schema setup failed. Show a clear message explaining what went wrong and what to do.

### 7. Add recovery path for failed schema on re-run

**File:** `packages/core/src/cli/run.ts:192-237`

If schema setup failed and user runs `0pflow run` again, `isExisting0pflow()` returns true (package.json exists with 0pflow dependency), so it goes straight to launch — which crashes again. There's no way to retry schema setup.

**Fix:** When detecting an existing project, check if `.env` has `DATABASE_SCHEMA`. If not, offer to retry schema setup instead of launching.

### 8. Make `setupAppSchema` idempotent / retry-safe

**File:** `packages/core/src/cli/mcp/lib/scaffolding.ts:243-248`

If the PostgreSQL role already exists (from a partial previous run), `setupAppSchema` returns an error: _"User 'X' already exists"_. This blocks retrying.

**Fix:** If the user already exists, reuse it — generate a new password with `ALTER ROLE ... PASSWORD`, then continue with schema creation. The function already checks if `DATABASE_SCHEMA` is set in `.env` and returns early, so we just need the SQL part to be idempotent too.

### 9. Add connection readiness check (not just status polling)

**File:** `packages/core/src/cli/run.ts:38-71`

`waitForDatabase()` polls `tiger service get` for status=READY, but in practice the service can report READY before DNS resolves (transcript shows `getaddrinfo ENOTFOUND` on a READY service).

**Fix:** After status=READY, do a lightweight pg connection test (or DNS lookup) before returning true. Retry if it fails.

### 10. Auto-resume paused databases in new project flow

**File:** `packages/core/src/cli/run.ts:396-402`

When selecting an existing PAUSED database during new project creation, the code calls `startDatabaseIfNeeded(serviceId, true)` with `noWait=true` and just logs a message. The later `waitForDatabase` call should handle this, but the messaging is confusing — the spinner says "Checking database status..." not "Starting paused database...".

**Fix:** When a paused database is selected, use `noWait=false` (blocking start) OR show a clear spinner message during the wait phase. Also show the status hint more prominently in the database selection list so users know they're picking a paused DB.

## Phase 4: Polish

### 11. Improve error messages throughout

Replace raw stack traces with user-friendly messages. Key places:
- `getAppSchema()` crash → "Database not configured. Run `0pflow run` to set up."
- `tiger` command failures → "Could not connect to Tiger Cloud. Run `tiger login` first."
- npm install failures → "Dependency installation failed. Try running `npm install` manually."

### 12. Add `--loglevel=error` to npx invocations

**File:** `packages/core/src/cli/install.ts:254`

The `npx` command shown to users after install doesn't suppress warnings. Change to `npx --loglevel=error -y 0pflow@... run`.

### 13. ~~Consider global CLI install~~ — Decided against

We want "always fresh" — every invocation should pull the latest dev build. The bash script sets up a shell alias (`alias 0pflow='npx -y --prefer-online 0pflow@dev'`) which handles this. A global install would require explicit `npm update -g` to get new versions.

## Implementation Order

1. **Phase 1** — Bash bootstrap script. Get the entry point right.
2. **Phase 2** — Simplify the interface. Merge install into run, auto-login, default dirs, suppress warnings.
3. **Phase 3** — Fix crashes and dead-ends in the setup flow.
4. **Phase 4** — Polish error messages and commands.
