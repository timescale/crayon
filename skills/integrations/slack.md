# Slack Integration

Guide for generating typed Slack nodes using the `@slack/web-api` SDK.

Credentials are managed through the Dev UI Credentials page. Connections are created with the following scopes:

- **Bot Token Scopes:** `channels:read`, `chat:write`, `groups:read`, `im:write`, `users:read`, `users:read.email`, `channels:history`
- **User Token Scopes:** `search:read`

Nodes access credentials at runtime via `ctx.getConnection("slack")`.

---

## CRITICAL: Connection Required

**This entire setup requires a live Slack connection.** Before doing ANYTHING below, `get_connection` for `"slack"` must succeed. If it fails (no connection configured or authentication error), **STOP — do not proceed with any steps in this file.** Tell the user to connect Slack via the Credentials page in the Dev UI sidebar. Then say "continue" when ready.

---

## Important: User Token vs Bot Token

Slack OAuth connections provide two tokens with different capabilities:

| Token | Access | Use For |
|-------|--------|---------|
| Bot token (`conn.token`) | Channels the bot is in | `chat.postMessage`, `conversations.list`, `conversations.history`, `users.list`, `reactions.add` |
| User token (`conn.raw.raw.authed_user.access_token`) | Full workspace access as the authed user | `search.messages`, `search.files`, any user-scoped API |

The bot token is returned directly by `ctx.getConnection("slack")`. The user token is nested inside the raw credentials.

### When You Need the User Token

The Slack `search.messages` and `search.files` APIs **only work with user tokens**. The `search:read` user scope is already included in the connection configuration.

If `conn.raw.raw.authed_user.access_token` is missing or only contains `{ id }` without `access_token`, the user may need to re-authorize the connection. Tell the user to disconnect and reconnect Slack via the Credentials page in the Dev UI.

### Extracting Tokens

```typescript
const conn = await ctx.getConnection("slack");

// Bot token — for most APIs
const botToken = conn.token;
const botClient = new WebClient(botToken);

// User token — for search APIs (requires user scopes)
const userToken = (conn as any).raw?.raw?.authed_user?.access_token;
if (!userToken) {
  throw new Error("No Slack user token found. Re-authorize the Slack connection in the Dev UI.");
}
const userClient = new WebClient(userToken);
```

### Connection Config

  The connection also provides:
  - `conn.raw.raw.bot_user_id` — the bot's Slack user ID
  - `conn.raw.raw.team.id` — the workspace/team ID
  - `conn.raw.raw.authed_user.id` — the Slack user ID of the person who authorized the connection
  - `conn.raw.raw.authed_user.access_token` — the user token 

---

## Pre-Flight Checks

### 1. Check for Dependencies

```bash
npm i @slack/web-api
```

### 2. Get Credentials

Use the `get_connection` tool:

```
get_connection({ integration_id: "slack", workflow_name: "<name>", node_name: "<name>" })
```

This returns:
- `token` — bot access token
- `connectionConfig` — team ID, bot user ID
- `raw.raw.authed_user.access_token` — user token 

### 3. Resolve User IDs

Slack APIs reference users by ID (e.g., `U0736TW20`), not display name. To resolve a username to an ID:

```typescript
const result = await botClient.users.list({});
const user = result.members?.find(
  (m) => m.name === "username" || m.profile?.display_name === "username"
);
const userId = user?.id;
```

For @mention search queries, use the `<@USER_ID>` format: `<@U0736TW20>`.

---

## Common API Patterns

### Search Messages (User Token Required)

```typescript
const result = await userClient.search.messages({
  query: "<@U0736TW20> after:2026-03-01",
  sort: "timestamp",
  sort_dir: "desc",
  count: 100,
  page: 1,
});

const messages = (result.messages as any)?.matches || [];
const total = (result.messages as any)?.total || 0;
```

Search query syntax:
- `<@USER_ID>` — messages mentioning a user
- `from:<@USER_ID>` — messages sent by a user
- `in:#channel-name` — messages in a specific channel
- `after:YYYY-MM-DD` / `before:YYYY-MM-DD` — date filters
- `has:link` / `has:reaction` — content filters

Pagination: Use `page` parameter (1-indexed). Check if `matches.length < count` to detect last page.

---

## Security Notes

1. **Never log or persist tokens** — bot and user tokens are sensitive credentials
2. **Use bot token by default** — only use the user token when the API requires it (search)
3. **Side-effect nodes must support test mode** — skip `chat.postMessage` / `conversations.open` when `ctx.testMode` is true
4. **Validate DM targets** — the `userId` for DMs must come from an explicit input or upstream node output, never fabricated
