# Deploy Flows

Three deployment flows exist. Each serves a different purpose.

## Flow 1: Golden Master Go Live (maintainer, one-time per release)

Prepares both repos so end users can one-click deploy.

1. Squash and commit all changes in `lore-mcp` (core)
2. Bump `version` in `lore-mcp/package.json` — this is the single source of truth for the version
3. Tag the commit: `git tag v$(node -p "require('./package.json').version")`
4. Push `lore-mcp` + tag to GitHub
5. In `lore-mcp-cloudflare`: run `bun run repin-lore-mcp` to update the pinned `lore-mcp` dependency and refresh `bun.lock`
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
   - Workers Builds injects `WORKERS_CI_BRANCH` and `WORKERS_CI_COMMIT_SHA`
   - App version is read from `lore-mcp/package.json` at build time and baked as `APP_VERSION` var
   - Build branch + commit are baked into the worker as auto-update install context
   - Wrangler provisions D1, KV, Durable Objects, AI, Vectorize from `wrangler.jsonc`
5. Worker is live at `<name>.workers.dev`
6. User connects MCP client (Claude.ai, ChatGPT, Claude Desktop, Claude Code)
7. Auth flow: passphrase → TOTP enrollment → passkey enrollment
8. User asks agent: `engine_check(action="enable_auto_updates")`
9. Agent returns a one-time browser link
10. User opens link, enters a GitHub PAT:
    - Fine-grained PAT only: `Contents: Read and write` and `Workflows: Read and write`, scoped to the user's deploy repo
11. `installWorkflowToRepo()` writes the dependency-bump workflow into the user's repo
    - The install flow verifies the repo against the recorded build branch + commit before installing
    - The PAT must expose exactly one writable deploy repo

### Auto-update cycle (nightly, automatic after step 11)

The installed workflow runs on a daily cron:
1. Fetches tags matching `v*` from `rudavko/lore-mcp` (hardcoded constant in the workflow YAML)
2. Repins `dependencies.lore-mcp` and refreshes `bun.lock`
3. If files changed: opens or updates a pull request for the dependency bump
4. User merges that PR
5. Cloudflare Workers Builds deploys the merged push from the connected repo

The workflow uses the default `GITHUB_TOKEN` provided by GitHub Actions. No stored PAT is needed after installation.

## Flow 3: Manual Deploy (maintainer, testing)

For local testing without the one-click flow.

1. `cd lore-mcp-cloudflare`
2. `bun install && bun test && tyn-es .`
3. `node scripts/deployWorker.js`
4. Optional direct workflow install without the browser flow: `MANUAL_DEPLOY_TARGET_REPO=<owner/repo> node scripts/installWorkflow.js`

For the direct workflow-install helper, `MANUAL_DEPLOY_TARGET_REPO` overrides git remote inference. Wrangler deploys directly to Cloudflare via API.

## Key Design Decisions

- **Version source of truth**: `lore-mcp/package.json` `version` field. Git tags are derived from it. There is no separate `APP_VERSION` constant — the version is read from the installed `lore-mcp` package at build time and baked into the deployed worker.
- **Repo selection during workflow install**: The public one-click deploy path stores build branch + commit in worker env from Workers Builds. The admin install page requires a fine-grained PAT scoped to exactly one writable repo and verifies that repo against the recorded build ref before writing the workflow. The direct helper script accepts `MANUAL_DEPLOY_TARGET_REPO` or a positional repo argument when a maintainer wants to install the workflow outside the browser flow.
- **Upstream repo hardcoded**: The auto-update workflow checks `rudavko/lore-mcp` for new `v*` tags. This is a hardcoded constant in the workflow YAML.
- **Managed workflow updates only**: The installer silently updates `.github/workflows/upstream-sync.yml` only when the existing file is missing or already marked as lore-managed. Unmanaged files at that path fail closed.
- **Atomic one-time links**: The setup link is claimed before installation and marked complete after success so concurrent reuse fails closed.
- **No delete**: Obsolete data is handled via `supersedes` links, not deletion. There is no delete action on the public MCP surface.
- **Four tools only**: The public v0 MCP surface is exactly `link_object`, `object_create`, `retrieve`, `engine_check`.
- **Shell version irrelevant**: `lore-mcp-cloudflare/package.json` version is not user-facing. The version users see is from the `lore-mcp` core dependency.
