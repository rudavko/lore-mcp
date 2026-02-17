# Tasks 001: Self-Serve Updates for Public Deployments

## Ordered Checklist

1. [x] README deployment entrypoint and clarity updates (US-001, US-002)
2. [x] README post-deploy checklist for auth/readiness (US-003)
3. [x] Document update modes with manual default and switchability (US-004)
4. [x] Add manual update button/link to workflow run page (US-007)
5. [x] Implement manual update workflow with force-sync semantics (US-008)
6. [x] Add overwrite-risk warning in docs and workflow output (US-009)
7. [x] Implement auto-update enable action (US-005)
8. [x] Implement auto-update disable action (US-006)
9. [x] Ensure manual update remains available regardless of auto-update state (US-004, US-007)
10. [x] Add failure visibility and troubleshooting guidance (US-010)
11. [x] Add rollback guidance using Cloudflare Worker versions (US-011)
12. [x] Add data safety and destructive delete/redeploy warnings (US-012)
13. [ ] Validate all story acceptance criteria and update status.yaml (US-001 to US-012)

## Verification Checklist

1. [ ] All README links resolve and expected actions are obvious.
2. [ ] Manual update workflow can be triggered from GitHub UI.
3. [ ] Auto-update can be enabled and disabled with explicit confirmations.
4. [ ] Workflow logs include overwrite warning and before/after commit references.
5. [ ] Rollback instructions are executable without deleting the project.
6. [ ] Data safety language clearly differentiates safe vs destructive paths.
