# TODO

- [ ] Reduce `get_trace` MCP tool output verbosity — return a compact summary by default and support zooming into specific operations
- [ ] Skip GitHub re-auth for dev UI when CLI is already logged in — at the end of `crayon cloud run`, when opening the dev UI browser window, CLI calls `POST /api/auth/dev-ui/session` with its bearer token to get a short-lived one-time code (30s TTL, single-use), then opens browser to `/auth/dev-ui?app=<fly-app>&code=<code>`; server exchanges code → CLI session → signs dev UI JWT and redirects to machine. Keeps bearer token out of URLs entirely.
