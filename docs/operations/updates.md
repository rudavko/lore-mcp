# Updates

The committed dependency-bump workflow lives in the Cloudflare deploy shell repo at `lore-mcp-cloudflare/.github/workflows/upstream-sync.yml`. The admin install flow writes the same workflow shape into a downstream deploy repo through the GitHub API.

Installed workflow path: `.github/workflows/upstream-sync.yml`

## Why This Path

`lore-mcp` is the source repo. `lore-mcp-cloudflare` and user-owned downstream deploy repos are the places that actually carry the `lore-mcp` package dependency that gets bumped over time. The admin UI remains useful when a deployed worker needs to install or update that workflow in a different target repo.

## Setup

1. Generate or obtain a valid one-time admin install link for `/admin/install-workflow`.
2. Open the one-time browser link before it expires.
3. Enter a fine-grained GitHub PAT scoped to exactly one deploy repo. The PAT is used once and is not stored.
4. Click **Install**. The worker verifies the target repo before writing `.github/workflows/upstream-sync.yml`.

The install flow derives the browser URL from the live request origin. No separate public-base URL configuration is required.

## Verified Repo Selection

The install flow does not guess the repo from names, ordering, or heuristics.

Public one-click deploy path:

1. Cloudflare Workers Builds injects `WORKERS_CI_BRANCH` and `WORKERS_CI_COMMIT_SHA` into the build.
2. `scripts/deployWorker.js` stores those values in worker environment variables.
3. `engine_check(action="enable_auto_updates")` signs that branch + commit into the one-time setup link.
4. The install page requires a fine-grained PAT scoped to exactly one writable deploy repo.
5. On submit, the worker:
   - lists writable repos visible to that PAT
   - requires exactly one writable repo
   - verifies that the recorded build commit is on the recorded branch in that repo
   - verifies that the repo has deploy-shell markers: `package.json` with `dependencies.lore-mcp` and `wrangler.jsonc`
6. Only after those checks pass does it install or update `.github/workflows/upstream-sync.yml`.

Manual maintainer deploy path:

- `scripts/deployWorker.js` can instead store an exact repo name from `MANUAL_DEPLOY_TARGET_REPO`.
- In that mode, the install flow verifies PAT access to that exact repo and then writes the workflow.

## Prerequisites (Fork Secrets)

In GitHub `Settings -> Secrets and variables -> Actions`, add:

- `CLOUDFLARE_API_TOKEN` (Workers + D1 edit permissions)
- `CLOUDFLARE_ACCOUNT_ID` (Cloudflare account ID)

If Cloudflare secrets are missing, the dependency bump still commits in GitHub, but Cloudflare redeploys triggered by that push may fail.

## PAT Requirements

Your PAT must be able to read repo metadata and write `.github/workflows/upstream-sync.yml` through the GitHub Contents API. If workflow file creation fails with `403`, adjust PAT permissions/scopes and retry.

Accepted GitHub token shape:

- Fine-grained PAT only: repository access to your deploy repo with `Contents: Read and write` and `Workflows: Read and write`

Use a fine-grained PAT scoped to exactly one deploy repo. Classic PATs are not accepted for this install flow.

## Runtime Behavior

By default, the committed and installed workflow:

1. resolves the latest `v*` tag from `rudavko/lore-mcp`
2. runs `node ./scripts/repinLoreMcp.js --tag <latest>` to validate and repin `dependencies.lore-mcp`
3. runs `bun install` to refresh `bun.lock`
4. skips the rest of the run when `package.json` and `bun.lock` did not change
5. opens or updates a pull request for the dependency bump with the default GitHub Actions `GITHUB_TOKEN`

Manual `workflow_dispatch` remains available after installation for on-demand updates. If the current dependency already matches the latest upstream tag, the workflow exits without creating a pull request.
