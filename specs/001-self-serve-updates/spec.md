# Spec 001: Self-Serve Updates for Public Deployments

## Problem Statement

Users can deploy from a public repository, but post-deploy updates are not streamlined for non-technical operators. The product needs a clear and reliable self-serve update model with explicit opt-in auto-updates, a manual update path, and rollback/failure guidance.

## Goals

1. Make initial deployment clear from the public repository.
2. Provide a user-selectable update mode with manual updates as default.
3. Support optional auto-updates without requiring Git/GitHub expertise.
4. Keep a manual update path always available.
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
- Then I can verify required auth and owner configuration

- Given a required config value is missing
- When I access protected auth routes
- Then I receive clear actionable error messages

### US-004 User-selectable update mode (manual default)

As a user, I want to choose whether auto-updates are enabled, so I can control update risk.

Acceptance Criteria:

- Given I review update options
- When I have not opted into auto-updates
- Then manual update is the default mode

- Given I change my preference later
- When I use documented controls
- Then I can switch modes without redeploying the project

### US-005 Enable auto-update from UI/workflow

As a user, I want a low-friction way to enable auto-updates, so I do not need to edit workflow files directly.

Acceptance Criteria:

- Given auto-update is disabled
- When I run the documented enable action from workflow UI
- Then scheduled updates become active

- Given enable action succeeds
- When I read workflow logs
- Then logs confirm schedule status and next expected behavior

### US-006 Disable auto-update cleanly

As a user, I want to disable auto-updates at any time, so I can stop unattended changes immediately.

Acceptance Criteria:

- Given auto-update is enabled
- When I run the documented disable action from workflow UI
- Then scheduled updates stop

- Given disable action succeeds
- When I review workflow output
- Then I see confirmation that no further scheduled updates will run

### US-007 Manual update button/link to workflow run page

As a user, I want a manual update button that opens the workflow run page, so I can trigger updates on demand.

Acceptance Criteria:

- Given I am in the repository README
- When I click Manual Update
- Then I land on the GitHub Actions workflow page where I can click Run workflow

- Given auto-update is disabled
- When I need the latest upstream changes
- Then manual update remains available and functional

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

1. Auto-update enable/disable must remain decoupled from manual update availability.
2. Missing required configuration (for example, owner identity or passphrase) must fail loudly and clearly.
3. Force-sync behavior is intentional and must be prominently documented as overwrite-prone.
4. Cloudflare resource state and GitHub repository state may drift; troubleshooting must account for both.
5. Delete/redeploy is last-resort because it can be destructive for stateful resources.

## Success Metrics

1. Users can deploy and reach a functional endpoint without ad hoc support.
2. Users can run manual updates from a single documented entrypoint.
3. Users can explicitly opt in/out of scheduled auto-updates.
4. Update failures include actionable guidance and rollback steps.
5. Documentation makes destructive recovery paths unambiguous.

