/** @implements NFR-001 — Verify install-workflow template rendering. */
import { describe, test, expect } from "bun:test";
import { renderInstallWorkflowPage } from "./install-workflow.pure.js";
describe("templates/install-workflow.pure", () => {
	const baseParams = {
		setupToken: "setup123",
		csrfToken: "csrf456",
		defaultRepo: "owner/repo",
	};
	test("contains CSRF token", () => {
		expect(renderInstallWorkflowPage(baseParams).indexOf("csrf456")).toBeGreaterThan(-1);
	});
	test("shows fixed target repo value", () => {
		expect(renderInstallWorkflowPage(baseParams).indexOf("owner/repo")).toBeGreaterThan(-1);
	});
	test("does not contain passphrase input", () => {
		expect(renderInstallWorkflowPage(baseParams).indexOf('name="passphrase"')).toBe(-1);
	});
	test("does not contain editable target_repo input", () => {
		expect(renderInstallWorkflowPage(baseParams).indexOf('name="target_repo"')).toBe(-1);
	});
	test("contains setup token hidden input", () => {
		expect(renderInstallWorkflowPage(baseParams)).toContain('name="setup_token" value="setup123"');
	});
	test("contains github_pat input", () => {
		expect(renderInstallWorkflowPage(baseParams).indexOf("github_pat")).toBeGreaterThan(-1);
	});
	test("mentions short-lived repo-scoped setup link", () => {
		expect(renderInstallWorkflowPage(baseParams)).toContain(
			"This setup link is short-lived and scoped to the repository shown above.",
		);
	});
	test("shows automatic repository discovery messaging when no preset repo is provided", () => {
		const text = renderInstallWorkflowPage({
			...baseParams,
			defaultRepo: "",
		});
		expect(text).toContain("Target repository verification");
		expect(text).toContain("pinned to the deployed build branch and commit");
		expect(text).toContain(
			"Use a fine-grained PAT scoped to exactly one deploy repo with Metadata: read, Contents: read and write, and Workflows: read and write.",
		);
	});
	test("omits the form when setup token is unavailable", () => {
		const text = renderInstallWorkflowPage({
			...baseParams,
			setupToken: "",
			csrfToken: "",
		});
		expect(text).not.toContain('name="setup_token"');
		expect(text).not.toContain('name="github_pat"');
		expect(text).toContain("Generate a fresh one-time link with the enable_auto_updates MCP tool");
	});
	test("shows success banner when result.ok", () => {
		const text = renderInstallWorkflowPage({
			...baseParams,
			result: { ok: true, action: "created", commitUrl: "https://github.com/o/r/commit/abc" },
		});
		expect(text.indexOf("success")).toBeGreaterThan(-1);
		expect(text.indexOf("successfully")).toBeGreaterThan(-1);
	});
	test("shows commit link in success banner", () => {
		const text = renderInstallWorkflowPage({
			...baseParams,
			result: { ok: true, action: "updated", commitUrl: "https://github.com/o/r/commit/abc" },
		});
		expect(text.indexOf("https://github.com/o/r/commit/abc")).toBeGreaterThan(-1);
	});
	test("shows up-to-date banner when workflow content is unchanged", () => {
		const text = renderInstallWorkflowPage({
			...baseParams,
			result: { ok: true, action: "unchanged" },
		});
		expect(text.indexOf("already up to date")).toBeGreaterThan(-1);
	});
	test("shows cleanup warning alongside a success result", () => {
		const text = renderInstallWorkflowPage({
			...baseParams,
			result: {
				ok: true,
				action: "unchanged",
				warning:
					"Workflow installed, but the one-time setup link could not be invalidated. It will expire shortly.",
			},
		});
		expect(text.indexOf("already up to date")).toBeGreaterThan(-1);
		expect(text.indexOf("could not be invalidated")).toBeGreaterThan(-1);
	});
	test("shows error banner when result not ok", () => {
		const text = renderInstallWorkflowPage({
			...baseParams,
			result: { ok: false, error: "rate limited" },
		});
		expect(text.indexOf("error")).toBeGreaterThan(-1);
		expect(text.indexOf("rate limited")).toBeGreaterThan(-1);
	});
	test("shows error banner for p.error", () => {
		const text = renderInstallWorkflowPage({
			...baseParams,
			error: "bad request",
		});
		expect(text.indexOf("error")).toBeGreaterThan(-1);
		expect(text.indexOf("bad request")).toBeGreaterThan(-1);
	});
	test("escapes XSS in default repo", () => {
		const text = renderInstallWorkflowPage({
			...baseParams,
			defaultRepo: "<script>alert(1)</script>",
		});
		expect(text.indexOf("<script>alert(1)</script>")).toBe(-1);
		expect(text.indexOf("&lt;script&gt;")).toBeGreaterThan(-1);
	});
});
