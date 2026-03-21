# Updates

This repo now commits the default GitHub sync workflow at `.github/workflows/upstream-sync.yml`. The admin install flow still exists for writing the same workflow into another deploy repo through the GitHub API.

Workflow path: `.github/workflows/upstream-sync.yml`

## Why This Path

The checked-in workflow keeps this repo configured by default. The admin UI remains useful when a deployed worker needs to install or update the workflow in a different target repo.

## Setup

1. Deploy the worker from your fork. The deploy step bakes the fork repo into the worker as `TARGET_REPO`.
2. Generate or obtain a valid one-time admin install link for `/admin/install-workflow`.
3. Open the one-time browser link before it expires.
4. Confirm the fixed target repo shown on the page.
5. Enter a GitHub PAT that can read repo metadata and write `.github/workflows/*` in that repo. The PAT is used once and is not stored.
6. Click **Install**. The worker writes `.github/workflows/upstream-sync.yml` to that repo's default branch.

The install flow derives the browser URL from the live request origin. No separate public-base URL configuration is required.

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

By default, the committed and installed workflow sync from `rudavko/lore-mcp`.

Optional:

- Set repository variable `UPSTREAM_REPO` to `owner/repo` to override the default upstream.
- `force_overwrite` defaults to `true` in manual dispatches, and the workflow also falls back to `FORCE_OVERWRITE=true` when no repository variable is set.
- Set repository variable `FORCE_OVERWRITE=false` to require fast-forward-only sync and fail on divergence.
