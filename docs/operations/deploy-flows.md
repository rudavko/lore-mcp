# Deploy Flows

Three deployment flows exist. Each serves a different purpose.

## Flow 1: Golden Master Go Live (maintainer, one-time per release)

Prepares both repos so end users can one-click deploy.

1. Squash and commit all changes in `lore-mcp` (core)
2. Bump `version` in `lore-mcp/package.json` — this is the single source of truth for the version
3. Tag the commit: `git tag v$(node -p "require('./package.json').version")`
4. Push `lore-mcp` + tag to GitHub
5. In `lore-mcp-cloudflare`: run the repin script that reads the latest `lore-mcp` tag and updates `package.json` dependency automatically
6. Push `lore-mcp-cloudflare` to GitHub
7. Verify the "Deploy to Cloudflare" button works end-to-end

The deploy button in `lore-mcp` README points to `lore-mcp-cloudflare`:
```
https://deploy.workers.cloudflare.com/?url=https://github.com/rudavko/lore-mcp-cloudflare
```

## Flow 2: End User CF Deploy (end user, one-click)

1. User clicks "Deploy to Cloudflare" button in `lore-mcp` README
2. Cloudflare clones `rudavko/lore-mcp-cloudflare` into the user's GitHub account (user can name the repo)
3. Cloudflare shows a config page — user enters `ACCESS_PASSPHRASE`
4. Cloudflare builds and deploys:
   - Build runs in a git checkout of the user's new repo
   - `deployWorker.js` infers `TARGET_REPO` from `git remote get-url origin` (the user's repo)
   - `TARGET_REPO` is baked into the deployed worker as an env var
   - App version is read from `lore-mcp/package.json` at build time and baked as `APP_VERSION` var
   - Wrangler provisions D1, KV, Durable Objects, AI, Vectorize from `wrangler.jsonc`
5. Worker is live at `<name>.workers.dev`
6. User connects MCP client (Claude.ai, ChatGPT, Claude Desktop, Claude Code)
7. Auth flow: passphrase → TOTP enrollment → passkey enrollment
8. User asks agent: `engine_check(action="enable_auto_updates")`
9. Agent returns a one-time browser link
10. User opens link, enters a GitHub PAT:
    - Classic PAT: `repo` and `workflow` scopes
    - Fine-grained PAT: `Contents: Read and write` and `Workflows: Read and write`, scoped to the user's deploy repo
11. `installWorkflowToRepo()` writes the version-check workflow into the user's repo

### Auto-update cycle (nightly, automatic after step 11)

The installed workflow runs on a daily cron:
1. Fetches tags matching `v*` from `rudavko/lore-mcp` (hardcoded constant in the workflow YAML)
2. Reads the current tag from `package.json` `lore-mcp` dependency string
3. If the latest tag differs: updates the tag in `package.json`, commits, pushes
4. Cloudflare detects the push and auto-deploys

The workflow uses the default `GITHUB_TOKEN` provided by GitHub Actions. No stored PAT needed — `GITHUB_TOKEN` has `contents: write` permission.

## Flow 3: Manual Deploy (maintainer, testing)

For local testing without the one-click flow.

1. `cd lore-mcp-cloudflare`
2. `bun install && bun test && tyn-es .`
3. `TARGET_REPO=<owner/repo> node scripts/deployWorker.js`

Explicit `TARGET_REPO` overrides git remote inference. Wrangler deploys directly to Cloudflare via API.

## Key Design Decisions

- **Version source of truth**: `lore-mcp/package.json` `version` field. Git tags are derived from it. There is no separate `APP_VERSION` constant — the version is read from the installed `lore-mcp` package at build time and baked into the deployed worker.
- **`TARGET_REPO` inference**: During CF one-click deploy, the build script infers the user's repo from `git remote get-url origin`. For manual deploy, an explicit `TARGET_REPO` env var or argument takes precedence.
- **Upstream repo hardcoded**: The auto-update workflow checks `rudavko/lore-mcp` for new `v*` tags. This is a hardcoded constant in the workflow YAML, not an env var.
- **No delete**: Obsolete data is handled via `supersedes` links, not deletion. There is no delete action on the public MCP surface.
- **Four tools only**: The public v0 MCP surface is exactly `link_object`, `object_create`, `retrieve`, `engine_check`.
- **Shell version irrelevant**: `lore-mcp-cloudflare/package.json` version is not user-facing. The version users see is from the `lore-mcp` core dependency.
