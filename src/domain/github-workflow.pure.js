/** @implements NFR-001 — Pure GitHub workflow helpers: repo parsing, YAML rendering, cron hashing. */
export const API_BASE = "https://api.github.com";
export const WORKFLOW_PATH = ".github/workflows/upstream-sync.yml";
export const COMMIT_MESSAGE = "chore: bump lore-mcp dependency";
export const UPSTREAM_CORE_REPO = "rudavko/lore-mcp";
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
		' 4 * * *"\n  workflow_dispatch:\n\npermissions:\n  contents: write\n\njobs:\n  sync:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.repository.default_branch }}\n\n      - uses: oven-sh/setup-bun@v2\n\n      - name: Resolve latest upstream lore-mcp tag\n        id: upstream\n        shell: bash\n        run: |\n          set -euo pipefail\n          latest_tag="$(git ls-remote --tags --refs https://github.com/' +
		UPSTREAM_CORE_REPO +
		'.git \'v*\' | awk -F/ \'{print $3}\' | sort -V | tail -n1)"\n          if [ -z "${latest_tag}" ]; then\n            echo "Failed to resolve upstream lore-mcp tag"\n            exit 1\n          fi\n          echo "latest_tag=${latest_tag}" >> "$GITHUB_OUTPUT"\n\n      - name: Read current lore-mcp dependency tag\n        id: current\n        shell: bash\n        run: |\n          set -euo pipefail\n          current_tag="$(node --input-type=module <<\'NODE\'\nimport { readFileSync } from \'node:fs\';\nconst pkg = JSON.parse(readFileSync(\'package.json\', \'utf8\'));\nconst dep = pkg.dependencies?.[\'lore-mcp\'];\nconst match = typeof dep === \'string\' ? dep.match(/#(v[^\\s]+)$/) : null;\nprocess.stdout.write(match ? match[1] : \'\');\nNODE\n)"\n          echo "current_tag=${current_tag}" >> "$GITHUB_OUTPUT"\n\n      - name: Update lore-mcp dependency tag\n        if: steps.current.outputs.current_tag != steps.upstream.outputs.latest_tag\n        shell: bash\n        run: |\n          set -euo pipefail\n          node --input-type=module <<\'NODE\'\nimport { readFileSync, writeFileSync } from \'node:fs\';\nconst pkg = JSON.parse(readFileSync(\'package.json\', \'utf8\'));\nconst latestTag = process.env.LATEST_TAG;\nconst dep = pkg.dependencies?.[\'lore-mcp\'];\nif (typeof dep !== \'string\') {\n  throw new Error(\'package.json dependencies.lore-mcp is missing\');\n}\npkg.dependencies[\'lore-mcp\'] = dep.replace(/#.+$/, `#${latestTag}`);\nwriteFileSync(\'package.json\', JSON.stringify(pkg, null, 2) + \'\\n\');\nNODE\n          bun install\n        env:\n          LATEST_TAG: ${{ steps.upstream.outputs.latest_tag }}\n\n      - name: Commit and push dependency bump\n        if: steps.current.outputs.current_tag != steps.upstream.outputs.latest_tag\n        shell: bash\n        run: |\n          set -euo pipefail\n          git config user.name "github-actions[bot]"\n          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"\n          git add package.json bun.lock\n          git commit -m "' +
		COMMIT_MESSAGE +
		' to ${{ steps.upstream.outputs.latest_tag }}"\n          git push origin "HEAD:${{ github.event.repository.default_branch }}"\n'
	);
}
