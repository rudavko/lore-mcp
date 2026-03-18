# Spec 001: Self-Serve Updates for Public Deployments

## Problem Statement

Users can deploy from a public repository, but post-deploy updates still need a clear self-serve path. The product needs a reliable model where the deploy repo is baked into the worker, `enable_auto_updates` installs the repository workflow on demand, and operators can then use the installed workflow for scheduled or manual updates with clear rollback/failure guidance.

## Goals

1. Make initial deployment clear from the public repository.
2. Provide an explicit opt-in path for installing the update workflow into the deploy repository.
3. Support scheduled updates without requiring users to edit workflow files manually.
4. Keep a manual workflow-dispatch path available after the update workflow is installed.
5. Make failure modes, overwrite risk, rollback, and data safety explicit.

## Non-Goals

1. Building a custom UI outside GitHub/Cloudflare surfaces.
2. Supporting per-tenant branching strategies.
3. Solving arbitrary upstream merge conflict resolution.
4. Replacing Cloudflare deployment/versioning mechanisms.

## User Stories

### US-001 Repo landing clarity

As a new user, I want to understand what the project does and how to deploy quickly, so I can decide whether to install it.

Acceptance Criteria:

- Given I open the public repository README
- When I view the top section
- Then I can see a plain-language summary and a primary Deploy button above the fold

- Given I need update information
- When I scan install instructions
- Then I can find a concise section describing manual versus auto-update options

### US-002 One-click deploy from public repo

As a user, I want one-click deployment from the public repository, so I can provision the service in my own Cloudflare account without CLI setup.

Acceptance Criteria:

- Given I click Deploy to Cloudflare from the public repository
- When deployment setup opens
- Then the flow targets the correct repository URL and required values are requested

- Given deployment completes
- When I view project output
- Then I receive the Worker endpoint needed for MCP connectivity

### US-003 Post-deploy readiness checks

As a user, I want explicit post-deploy checks, so I can verify the service is usable and secure.

Acceptance Criteria:

- Given deployment has completed
- When I follow the post-deploy checklist
- Then I can verify passphrase setup, 2FA enrollment, and MCP connectivity

- Given a required config value is missing
- When I access protected auth routes
- Then I receive clear actionable error messages

### US-004 Opt-in update workflow installation

As a user, I want scheduled updates to stay off until I explicitly install the update workflow, so I can control update risk.

Acceptance Criteria:

- Given I have not installed the update workflow
- When I review the worker documentation
- Then I see that scheduled updates are not active yet

- Given the deploy repo is baked into the worker
- When I run `enable_auto_updates` and complete the one-time setup page
- Then `.github/workflows/upstream-sync.yml` is installed without redeploying the worker

### US-005 Enable scheduled updates through the setup link

As a user, I want a low-friction way to enable scheduled updates, so I do not need to edit workflow files directly.

Acceptance Criteria:

- Given the worker knows my deploy repository
- When I call `enable_auto_updates`
- Then I receive a short-lived browser link for installing the workflow

- Given I open the setup link and provide a PAT with workflow-file write access
- When installation succeeds
- Then the repository contains `upstream-sync.yml` with a schedule and `workflow_dispatch`

### US-006 Disable scheduled updates cleanly

As a user, I want to stop unattended updates at any time, so I can remove scheduled execution when needed.

Acceptance Criteria:

- Given `upstream-sync.yml` is installed
- When I disable or remove that workflow in the repository
- Then scheduled updates stop

- Given I review the update docs
- When I look for how to stop scheduled updates
- Then the docs clearly explain that this is done through the repository workflow, not through a separate worker-side toggle

### US-007 Manual update entrypoint after workflow install

As a user, I want a documented manual update entrypoint after the update workflow is installed, so I can trigger updates on demand.

Acceptance Criteria:

- Given the update workflow has been installed in my deploy repository
- When I follow the documented manual update path
- Then I land on the GitHub Actions page for `upstream-sync.yml` where I can click Run workflow

- Given the workflow is still present in the repository
- When I need the latest upstream changes
- Then manual `workflow_dispatch` remains available and functional

### US-008 Force-sync update behavior (explicitly allowed)

As a user, I want update runs to force-sync from upstream, so I always get latest template updates even if local divergence exists.

Acceptance Criteria:

- Given I trigger an update
- When the update workflow runs
- Then local target branch is force-synced from upstream according to documented behavior

- Given force-sync executes
- When workflow completes
- Then logs include before/after commit identifiers

### US-009 Pre-update overwrite warning

As a user, I want clear warnings before force-sync updates, so I understand local modifications may be overwritten.

Acceptance Criteria:

- Given I view update documentation
- When I reach manual or auto-update sections
- Then overwrite risk is clearly stated

- Given I run manual update
- When workflow input and logs display
- Then overwrite warning is visible at execution time

### US-010 Failure visibility and actionable errors

As a user, I want plain-language failure reporting, so I can recover quickly.

Acceptance Criteria:

- Given an update or deploy-related step fails
- When I inspect workflow logs or docs
- Then I get a concise reason and an immediate next action

- Given failures repeat
- When I use troubleshooting guidance
- Then I can distinguish update logic issues from Cloudflare deployment issues

### US-011 Rollback path via Cloudflare versions

As a user, I want a straightforward rollback path, so I can restore service quickly after a bad update.

Acceptance Criteria:

- Given an update causes a regression
- When I follow rollback guidance
- Then I can revert to a known-good Cloudflare Worker version without deleting the project

- Given rollback succeeds
- When I re-test endpoint behavior
- Then service returns to prior expected behavior

### US-012 Data safety messaging (delete/redeploy marked destructive)

As a user, I want explicit data-safety messaging, so I avoid accidental data loss.

Acceptance Criteria:

- Given I read update and recovery documentation
- When destructive options are mentioned
- Then delete/redeploy is clearly marked as destructive and not the primary recovery path

- Given stateful resources exist (D1/KV/DO)
- When deciding update strategy
- Then documentation explains persistence and loss-risk boundaries

## Edge Cases and Constraints

1. Installing the update workflow must remain decoupled from worker redeploy once `TARGET_REPO` is baked in.
2. Missing required configuration (for example, target repo or passphrase) must fail loudly and clearly.
3. Force-sync behavior is intentional and must be prominently documented as overwrite-prone.
4. Cloudflare resource state and GitHub repository state may drift; troubleshooting must account for both.
5. Delete/redeploy is last-resort because it can be destructive for stateful resources.

## Success Metrics

1. Users can deploy and reach a functional endpoint without ad hoc support.
2. Users can run manual updates from a single documented entrypoint after workflow installation.
3. Users can explicitly opt into scheduled auto-updates through `enable_auto_updates`.
4. Update failures include actionable guidance and rollback steps.
5. Documentation makes destructive recovery paths unambiguous.
