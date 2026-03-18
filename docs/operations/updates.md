# Updates

Use the `enable_auto_updates` MCP tool to create a short-lived browser link for installing the update workflow in your fork. The workflow runs on a schedule to sync your fork with upstream.

Workflow created: `.github/workflows/upstream-sync.yml`

## Why This Path

In Deploy Button clones, `.github` workflow files are not preserved in the fork, so repository-committed update workflows are not reliable. The admin UI writes the workflow file directly to your fork via the GitHub API.

## Setup

1. Deploy the worker from your fork. The deploy step bakes the fork repo into the worker as `TARGET_REPO`.
2. Call the `enable_auto_updates` MCP tool with no arguments.
3. Open the returned one-time browser link before it expires.
4. Confirm the fixed target repo shown on the page.
5. Enter a GitHub PAT that can read repo metadata and write `.github/workflows/*` in that repo. The PAT is used once and is not stored.
6. Click **Install**. The worker writes `.github/workflows/upstream-sync.yml` to that repo's default branch.

The tool now derives the browser URL from the live MCP request origin. No separate public-base URL configuration is required.

## Prerequisites (Fork Secrets)

In GitHub `Settings -> Secrets and variables -> Actions`, add:

- `CLOUDFLARE_API_TOKEN` (Workers + D1 edit permissions)
- `CLOUDFLARE_ACCOUNT_ID` (Cloudflare account ID)

If Cloudflare secrets are missing, sync can still run but deploy is skipped.

## PAT Requirements

Your PAT must be able to read repo metadata and write `.github/workflows/upstream-sync.yml` through the GitHub Contents API. If workflow file creation fails with `403`, adjust PAT permissions/scopes and retry.

Accepted GitHub token shapes:

- Classic PAT: `repo` and `workflow`
- Fine-grained PAT: repository access to your deploy repo with `Contents: Read and write` and `Workflows: Read and write`

## Runtime Configuration

By default, the installed workflow syncs from `rudavko/lore-mcp`.

Optional:

- Set repository variable `UPSTREAM_REPO` to `owner/repo` to override the default upstream.
- Set repository variable `FORCE_OVERWRITE=true` to allow hard reset when histories diverge.
