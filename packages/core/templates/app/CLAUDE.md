# {{app_name}}
{{#if fly_app_name}}

## Cloud Dev Environment

This app is hosted on Fly.io. The public URL is:
https://{{fly_app_name}}.fly.dev/

When running `npm run dev`, the app is available at the public URL above, NOT at localhost.
The dev server (Next.js) binds to 0.0.0.0:3000 inside the container, and Fly proxies traffic to it.
{{/if}}

## Versions

This project uses automatic versioning powered by git. After making changes to workflows, nodes, or agents,
call the `create_version` MCP tool with a descriptive message to save a version (this creates a git commit under the hood).

- `create_version` — save current state with a commit message (first line = summary, then details)
- `list_versions` — show version history (reads git log)
- `restore_version` — roll back src/crayon/ files to a previous version (git checkout + new commit)

Versions are also saved automatically on first successful test run and first successful live run of each workflow.
