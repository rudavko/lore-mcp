/** @implements NFR-001 — Pure GitHub workflow helpers: repo parsing, YAML rendering, cron hashing. */
/** Sentinel for TDD hook. */
export const _MODULE = "github-workflow.pure";
export const API_BASE = "https://api.github.com";
export const WORKFLOW_PATH = ".github/workflows/upstream-sync.yml";
export const COMMIT_MESSAGE = "chore: enable upstream sync";
export const DEFAULT_UPSTREAM_REPO = "rudavko/lore-mcp";
/** Parse an "owner/repo" string into components.
 *  Returns { owner, repo } on success or { error } on failure. */
export function parseTargetRepo(targetRepo) {
	const parts = targetRepo.split("/");
	if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
		return {
			owner: null,
			repo: null,
			error: 'Invalid repo "' + targetRepo + '". Expected format: owner/repo',
		};
	}
	return { owner: parts[0], repo: parts[1], error: null };
}
/** Normalize a repo full name by trimming whitespace. Returns null if invalid. */
export function normalizeRepoFullName(repoFullName) {
	const trimmed = repoFullName.trim();
	const parsed = parseTargetRepo(trimmed);
	if (parsed.error !== null) {
		return null;
	}
	return parsed.owner + "/" + parsed.repo;
}
/** Compute a deterministic minute (0-59) from a seed string for cron scheduling. */
export function stableMinute(seed) {
	let hash = 0;
	for (const character of seed) {
		hash = (hash * 31 + character.charCodeAt(0)) % 4_294_967_296;
	}
	return hash % 60;
}
/** Render the upstream-sync workflow YAML for a given target repo. */
export function renderWorkflowYaml(targetRepo) {
	const minute = stableMinute(targetRepo);
	return (
		'name: Upstream Sync\n\non:\n  schedule:\n    - cron: "' +
		minute +
		' 4 * * *"\n  workflow_dispatch:\n    inputs:\n      force_overwrite:\n        description: Overwrite target branch when history diverges from upstream/main.\n        required: false\n        default: "true"\n\npermissions:\n  contents: write\n\njobs:\n  sync:\n    runs-on: ubuntu-latest\n    env:\n      TARGET_BRANCH: ${{ github.event.repository.default_branch }}\n      FORCE_OVERWRITE: ${{ github.event.inputs.force_overwrite || vars.FORCE_OVERWRITE || \'true\' }}\n      UPSTREAM_REPO: ${{ vars.UPSTREAM_REPO || \'' +
		DEFAULT_UPSTREAM_REPO +
		'\' }}\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.repository.default_branch }}\n          fetch-depth: 0\n\n      - name: Configure upstream remote\n        shell: bash\n        run: |\n          set -euo pipefail\n          if [ -z "${UPSTREAM_REPO}" ]; then\n            UPSTREAM_REPO="' +
		DEFAULT_UPSTREAM_REPO +
		'"\n          fi\n          git remote remove upstream 2>/dev/null || true\n          git remote add upstream "https://github.com/${UPSTREAM_REPO}.git"\n          git fetch upstream main\n\n      - name: Sync default branch from upstream/main\n        shell: bash\n        run: |\n          set -euo pipefail\n          git checkout "${TARGET_BRANCH}"\n\n          overwrite="false"\n          if git merge-base --is-ancestor HEAD upstream/main; then\n            git merge --ff-only upstream/main\n          elif [ "${FORCE_OVERWRITE}" = "true" ]; then\n            git reset --hard upstream/main\n            overwrite="true"\n          else\n            echo "History diverged. Set FORCE_OVERWRITE=true to allow hard reset."\n            exit 1\n          fi\n\n          if [ "${overwrite}" = "true" ]; then\n            git push origin "HEAD:${TARGET_BRANCH}" --force-with-lease\n          else\n            git push origin "HEAD:${TARGET_BRANCH}"\n          fi\n'
	);
}
