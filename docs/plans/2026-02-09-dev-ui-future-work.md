# Dev UI: Future Work After V1

Follow-up items from the visual workflow DAG UI design discussion. V1 implements static DAG extraction + file watching + React Flow visualization. These are the items to tackle after V1 ships.

## Execution Overlay (v2 priority)

- **Runtime status on nodes** — Poll DBOS step results table during/after workflow runs. Overlay running (blue), success (green), failed (red), skipped (gray) status on graph nodes. Pencil has this with animated edges and node glow effects.
- **Real-time push mechanism** — Replace polling with PostgreSQL LISTEN/NOTIFY or Server-Sent Events (SSE) for instant execution updates instead of 1-2s polling latency.
- **Agent execution detail** — Track individual tool calls within agent nodes as sub-steps. Currently an agent run is opaque (one DBOS step). Show the multi-turn tool calling loop (like Pencil's ConversationViewer).
- **Edge animation** — Animated flowing dashes on active edges (data currently flowing between nodes). Color transitions: blue=active, green=completed, red=failed. Reference: Pencil's edge status system.

## API Additions

- **`ctx.parallel()`** — Add parallel execution helper to WorkflowContext. Enables `const [a, b] = await ctx.parallel(ctx.run(nodeA, ...), ctx.run(nodeB, ...))`. DAG extractor recognizes this as a fork/join pattern.
- **`ctx.map()`** — Add loop/iteration helper. Enables `await ctx.map(items, item => ctx.run(processor, item))`. DAG extractor shows this as a loop node wrapping the inner step.
- **`ctx.branch()`** — Optional explicit branching helper as alternative to raw if/else. Makes conditional paths more extractable.

## Visual Editing

- **Add/remove nodes from UI** — Click to add a new node, drag to connect. Generates `ctx.run()` calls in the TypeScript code. Requires code generation (inverse of extraction).
- **Reorder steps** — Drag to reorder sequential steps, which rewrites the code.
- **Constraint**: visual editing only works for "scaffold" operations. Custom logic between steps must be edited in code. Accept this limitation gracefully — show a "code" indicator between nodes when there's non-trivial logic.

## Spec Integration

- **Watch spec files too** — Watch `specs/workflows/*.md` alongside TypeScript files. Show a "draft" graph from the spec (simpler parsing, just the Tasks section) alongside the compiled graph. Two tabs: "Spec" and "Code".
- **Bidirectional code-spec sync** — When code is edited, update the spec. When spec is edited, recompile. This is hard and was explicitly deferred. Consider whether the spec should just be deprecated in favor of code-only.

## UI Enhancements

- **Node detail panel** — Click a node to see inputSchema, outputSchema, import path, description in a side panel. Similar to Pencil's ActionPanel.
- **Click-to-navigate** — Click a node to open the source file at the relevant line in VS Code / the user's editor. Use `vscode://` URI scheme or configurable editor command.
- **Embeddable components** — Extract reusable React components from `packages/dev-ui/` into `packages/ui/` so users can embed the workflow graph in their own apps (not just the standalone dev server).
- **Run history browser** — Show past workflow runs in the UI, with ability to select a run and see the execution trace overlaid on the graph.
- **Connection status indicator** — Show WebSocket connection state (connected/reconnecting/disconnected) in the UI header.
- **Dark mode** — Follow system preference.

## Performance

- **Incremental tree-sitter parsing** — V1 re-parses the full file on change. Tree-sitter supports incremental parsing (only re-parse changed regions). Implement this if large workflow files cause noticeable latency.
- **Debounce tuning** — The 150ms debounce may need tuning. Too short = excessive re-parses during rapid edits. Too long = laggy visual feedback. Consider adaptive debouncing.

## Distribution

- **`crayon dev` in example app template** — When `create-workflow` skill scaffolds a new project, include `@crayon/dev-ui` as a devDependency and add a `dev:ui` script.
- **Standalone binary** — Consider packaging `crayon dev` as a standalone binary (e.g., via pkg or bun compile) so users don't need to install the dev-ui package separately.
