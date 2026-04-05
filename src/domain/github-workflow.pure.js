/** @implements NFR-001 — Pure GitHub workflow helpers: repo parsing, YAML rendering, cron hashing. */
export const API_BASE = "https://api.github.com";
export const WORKFLOW_PATH = ".github/workflows/upstream-sync.yml";
export const COMMIT_MESSAGE = "chore: bump lore-mcp dependency";
export const UPSTREAM_CORE_REPO = "rudavko/lore-mcp";
export const MANAGED_WORKFLOW_HEADER = "# Managed by lore-mcp auto-updates";
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
		MANAGED_WORKFLOW_HEADER +
		'\nname: Upstream Sync\n\non:\n  schedule:\n    - cron: "' +
		minute +
		' 4 * * *"\n  workflow_dispatch:\n\npermissions:\n  contents: write\n  pull-requests: write\n\njobs:\n  sync:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.repository.default_branch }}\n\n      - uses: oven-sh/setup-bun@v2\n\n      - name: Resolve latest upstream lore-mcp tag\n        id: upstream\n        shell: bash\n        run: |\n          set -euo pipefail\n          latest_tag="$(git ls-remote --tags --refs https://github.com/' +
		UPSTREAM_CORE_REPO +
		'.git \'v*\' | awk -F/ \'{print $3}\' | sort -V | tail -n1)"\n          if [ -z "${latest_tag}" ]; then\n            echo "Failed to resolve upstream lore-mcp tag"\n            exit 1\n          fi\n          echo "latest_tag=${latest_tag}" >> "$GITHUB_OUTPUT"\n\n      - name: Repin lore-mcp dependency\n        id: repin\n        if: steps.upstream.outputs.latest_tag != \'\'\n        shell: bash\n        run: |\n          set -euo pipefail\n          node ./scripts/repinLoreMcp.js --tag "${LATEST_TAG}"\n          if git diff --quiet -- package.json bun.lock; then\n            echo "changed=false" >> "$GITHUB_OUTPUT"\n            exit 0\n          fi\n          echo "changed=true" >> "$GITHUB_OUTPUT"\n        env:\n          LATEST_TAG: ${{ steps.upstream.outputs.latest_tag }}\n\n      - name: Create pull request for dependency bump\n        if: steps.repin.outputs.changed == \'true\'\n        uses: peter-evans/create-pull-request@v7\n        with:\n          token: ${{ secrets.GITHUB_TOKEN }}\n          commit-message: "' +
		COMMIT_MESSAGE +
		' to ${{ steps.upstream.outputs.latest_tag }}"\n          branch: lore-mcp-auto-update/${{ steps.upstream.outputs.latest_tag }}\n          delete-branch: true\n          title: "' +
		COMMIT_MESSAGE +
		' to ${{ steps.upstream.outputs.latest_tag }}"\n          body: |\n            Automated lore-mcp dependency repin to `${{ steps.upstream.outputs.latest_tag }}`.\n          labels: dependencies\n'
	);
}
