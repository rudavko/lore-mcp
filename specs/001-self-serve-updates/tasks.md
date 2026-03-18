# Tasks 001: Self-Serve Updates for Public Deployments

## Ordered Checklist

1. [x] README deployment entrypoint and clarity updates (US-001, US-002)
2. [x] README post-deploy checklist for auth/readiness (US-003)
3. [x] Document opt-in workflow installation via `enable_auto_updates` (US-004, US-005)
4. [x] Install `upstream-sync.yml` with schedule + manual `workflow_dispatch` (US-005, US-007, US-008)
5. [x] Add overwrite-risk warning in docs and workflow output (US-009)
6. [x] Document repository-side disable/removal path for scheduled updates (US-006)
7. [x] Ensure manual workflow-dispatch remains documented after workflow installation (US-007)
8. [x] Add failure visibility and troubleshooting guidance (US-010)
9. [x] Add rollback guidance using Cloudflare Worker versions (US-011)
10. [x] Add data safety and destructive delete/redeploy warnings (US-012)
11. [ ] Validate all story acceptance criteria and update status.json (US-001 to US-012)

## Verification Checklist

1. [ ] All README links resolve and expected actions are obvious.
2. [ ] `enable_auto_updates` returns a setup link and installs `upstream-sync.yml`.
3. [ ] Installed `upstream-sync.yml` can be triggered manually from GitHub UI.
4. [ ] Workflow logs include overwrite warning and before/after commit references.
5. [ ] Rollback instructions are executable without deleting the project.
6. [ ] Data safety language clearly differentiates safe vs destructive paths.
