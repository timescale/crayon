---
name: integrations
description: Generate integration nodes for external APIs (Salesforce, HubSpot, etc.). Creates typed function nodes with authentication and error handling.
---

# Integrations

This skill generates function nodes for querying external APIs. It creates properly typed nodes with authentication, error handling, and schema validation.

---

## Supported Integrations

| Integration | Auth Method | File |
|-------------|-------------|------|
| PostgreSQL | Connection String (via Credentials) | `postgres.md` |
| Salesforce | OAuth2 Client Credentials | `salesforce.md` |
| Slack | OAuth2 (Bot + User tokens) | `slack.md` |

**To use a listed integration:** Read this skill's corresponding file (e.g., `salesforce.md`).

**For unlisted systems:** Read this skill's `unlisted.md` for instructions on researching and setting up custom integrations.

---

## After Integration Setup

After generating integration node files:

1. **Save a version** — Call the `create_version` MCP tool with a message like:
   ```
   Add integration: <integration-name>

   <Describe what changed — like a good git commit message body.>
   ```
2. Tell the user which files were created and what to do next.
