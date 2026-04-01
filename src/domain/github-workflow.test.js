/** @implements NFR-001 — Verify GitHub workflow pure helpers. */
import { describe, test, expect } from "bun:test";
import {
	API_BASE,
	WORKFLOW_PATH,
	COMMIT_MESSAGE,
	UPSTREAM_CORE_REPO,
	parseTargetRepo,
	normalizeRepoFullName,
	stableMinute,
	renderWorkflowYaml,
} from "./github-workflow.pure.js";
describe("domain/github-workflow.pure", () => {
	test("pins the GitHub workflow installation contract", () => {
		expect(API_BASE).toBe("https://api.github.com");
		expect(WORKFLOW_PATH).toBe(".github/workflows/upstream-sync.yml");
		expect(COMMIT_MESSAGE).toBe("chore: bump lore-mcp dependency");
		expect(UPSTREAM_CORE_REPO).toBe("rudavko/lore-mcp");
	});
	describe("parseTargetRepo", () => {
		test("parses valid owner/repo", () => {
			const result = parseTargetRepo("octocat/hello-world");
			expect(result.owner).toBe("octocat");
			expect(result.repo).toBe("hello-world");
		});
		test("returns error for bare name", () => {
			const result = parseTargetRepo("noslash");
			expect(result.owner).toBeNull();
			expect(result.repo).toBeNull();
			expect(result.error).toBe('Invalid repo "noslash". Expected format: owner/repo');
			expect(result.error).not.toBeNull();
		});
		test("returns error for too many segments", () => {
			const result = parseTargetRepo("a/b/c");
			expect(result.error).not.toBeNull();
		});
		test("returns error for empty string", () => {
			const result = parseTargetRepo("");
			expect(result.error).not.toBeNull();
		});
		test("returns error for missing repo", () => {
			const result = parseTargetRepo("owner/");
			expect(result.error).not.toBeNull();
		});

		test("returns error for missing owner", () => {
			const result = parseTargetRepo("/repo");
			expect(result.owner).toBeNull();
			expect(result.repo).toBeNull();
			expect(result.error).toBe('Invalid repo "/repo". Expected format: owner/repo');
		});
	});
	describe("normalizeRepoFullName", () => {
		test("trims whitespace", () => {
			const result = normalizeRepoFullName("  owner/repo  ");
			expect(result).toBe("owner/repo");
		});
		test("trims tabs and newlines", () => {
			const result = normalizeRepoFullName("\t owner/repo \n");
			expect(result).toBe("owner/repo");
		});
		test("returns null for invalid input", () => {
			expect(normalizeRepoFullName("invalid")).toBeNull();
		});
	});
	describe("stableMinute", () => {
		test("returns value between 0 and 59", () => {
			const m = stableMinute("test/repo");
			expect(m).toBeGreaterThanOrEqual(0);
			expect(m).toBeLessThan(60);
		});
		test("matches known deterministic values", () => {
			expect(stableMinute("owner/repo")).toBe(22);
			expect(stableMinute("test/repo")).toBe(27);
			expect(stableMinute("a/b")).toBe(32);
		});
		test("is deterministic for same input", () => {
			expect(stableMinute("a/b")).toBe(stableMinute("a/b"));
		});
		test("varies for different inputs", () => {
			const m1 = stableMinute("a/b");
			const m2 = stableMinute("c/d");
			const m3 = stableMinute("e/f");
			const unique = new Set([m1, m2, m3]);
			expect(unique.size).toBeGreaterThan(1);
		});
	});
	describe("renderWorkflowYaml", () => {
		test("contains workflow name", () => {
			const yaml = renderWorkflowYaml("owner/repo");
			expect(yaml.indexOf("Upstream Sync")).toBeGreaterThan(-1);
		});
		test("contains cron schedule", () => {
			const yaml = renderWorkflowYaml("owner/repo");
			expect(yaml.indexOf("cron:")).toBeGreaterThan(-1);
		});
		test("uses stableMinute for cron", () => {
			const yaml = renderWorkflowYaml("test/repo");
			const minute = stableMinute("test/repo");
			expect(yaml.indexOf(minute + " 4")).toBeGreaterThan(-1);
		});
		test("contains checkout step", () => {
			const yaml = renderWorkflowYaml("owner/repo");
			expect(yaml.indexOf("actions/checkout")).toBeGreaterThan(-1);
		});

		test("runs on daily cron and workflow dispatch", () => {
			const yaml = renderWorkflowYaml("owner/repo");
			expect(yaml.indexOf("workflow_dispatch")).toBeGreaterThan(-1);
			expect(yaml.indexOf("schedule:")).toBeGreaterThan(-1);
		});

		test("checks the hardcoded upstream core repo for the latest v* tag", () => {
			const yaml = renderWorkflowYaml("owner/repo");
			expect(yaml.indexOf("https://github.com/rudavko/lore-mcp.git 'v*'")).toBeGreaterThan(-1);
			expect(yaml.indexOf("latest_tag")).toBeGreaterThan(-1);
		});

		test("reads the current lore-mcp dependency tag from package.json", () => {
			const yaml = renderWorkflowYaml("owner/repo");
			expect(yaml.indexOf("pkg.dependencies?.['lore-mcp']")).toBeGreaterThan(-1);
			expect(yaml.indexOf("match(/#(v")).toBeGreaterThan(-1);
		});

		test("updates package.json and bun.lock when the upstream tag changes", () => {
			const yaml = renderWorkflowYaml("owner/repo");
			expect(yaml.indexOf("pkg.dependencies['lore-mcp'] = dep.replace(/#.+$/, `#${latestTag}`)")).toBeGreaterThan(-1);
			expect(yaml.indexOf("bun install")).toBeGreaterThan(-1);
			expect(yaml.indexOf("git add package.json bun.lock")).toBeGreaterThan(-1);
		});

		test("uses contents: write and the default GITHUB_TOKEN push flow", () => {
			const yaml = renderWorkflowYaml("owner/repo");
			expect(yaml.indexOf("permissions:\n  contents: write")).toBeGreaterThan(-1);
			expect(yaml.indexOf("git push origin")).toBeGreaterThan(-1);
		});

		test("does not contain the removed mirror workflow logic", () => {
			const yaml = renderWorkflowYaml("owner/repo");
			expect(yaml.indexOf("git remote add upstream")).toBe(-1);
			expect(yaml.indexOf("git fetch upstream main")).toBe(-1);
			expect(yaml.indexOf("git merge --ff-only upstream/main")).toBe(-1);
			expect(yaml.indexOf("--force-with-lease")).toBe(-1);
		});
	});
});
