/** @implements NFR-001 — Verify one-time auto-updates link helpers. */
import { describe, expect, test } from "bun:test";
import {
	_MODULE,
	AUTO_UPDATES_LINK_PREFIX,
	AUTO_UPDATES_LINK_TTL_SECONDS,
	buildEnableAutoUpdatesPath,
	buildEnableAutoUpdatesUrl,
	getAutoUpdatesLinkInternals,
	resolveEnableAutoUpdatesBaseUrl,
} from "./auto-updates-link.pure.js";
const encodeSetupToken = globalThis.encodeURIComponent;
const {
	hasSafeHostShape,
	isLocalHost,
	isKnownHttpScheme,
	normalizeAbsoluteBaseUrl,
	normalizeHeaderCandidate,
	normalizeForwardedValue,
	parseCfVisitorScheme,
	readHeaderValue,
	resolveScheme,
} = getAutoUpdatesLinkInternals();

describe("domain/auto-updates-link.pure", () => {
	test("constants are non-empty and positive", () => {
		expect(_MODULE).toBe("auto-updates-link.pure");
		expect(AUTO_UPDATES_LINK_PREFIX.length).toBeGreaterThan(0);
		expect(AUTO_UPDATES_LINK_TTL_SECONDS).toBe(900);
	});

	test("buildEnableAutoUpdatesPath encodes the setup token", () => {
		expect(buildEnableAutoUpdatesPath("token 123", encodeSetupToken)).toBe(
			"/admin/install-workflow?setup_token=token%20123",
		);
	});

	test("buildEnableAutoUpdatesPath delegates to the provided encoder exactly once", () => {
		const seen = [];
		const encode = (value) => {
			seen.push(value);
			return "encoded-token";
		};
		expect(buildEnableAutoUpdatesPath("token/123", encode)).toBe(
			"/admin/install-workflow?setup_token=encoded-token",
		);
		expect(seen).toEqual(["token/123"]);
	});

	test("buildEnableAutoUpdatesUrl joins an absolute base URL and setup token path", () => {
		expect(buildEnableAutoUpdatesUrl("https://example.com", "abc", encodeSetupToken)).toBe(
			"https://example.com/admin/install-workflow?setup_token=abc",
		);
		expect(buildEnableAutoUpdatesUrl("https://example.com/", "abc", encodeSetupToken)).toBe(
			"https://example.com/admin/install-workflow?setup_token=abc",
		);
		expect(
			buildEnableAutoUpdatesUrl(" http://localhost:8787/root/ ", "abc", encodeSetupToken),
		).toBe("http://localhost:8787/root/admin/install-workflow?setup_token=abc");
	});

	test("buildEnableAutoUpdatesUrl returns null when base URL is absent or invalid", () => {
		expect(buildEnableAutoUpdatesUrl(undefined, "abc", encodeSetupToken)).toBeNull();
		expect(buildEnableAutoUpdatesUrl(null, "abc", encodeSetupToken)).toBeNull();
		expect(buildEnableAutoUpdatesUrl("", "abc", encodeSetupToken)).toBeNull();
		expect(buildEnableAutoUpdatesUrl("example.com", "abc", encodeSetupToken)).toBeNull();
		expect(buildEnableAutoUpdatesUrl("ftp://example.com", "abc", encodeSetupToken)).toBeNull();
	});

	test("normalizeAbsoluteBaseUrl trims and only accepts http/https origins", () => {
		expect(normalizeAbsoluteBaseUrl(" https://example.com/ ")).toBe("https://example.com");
		expect(normalizeAbsoluteBaseUrl("http://localhost:8787/app/")).toBe(
			"http://localhost:8787/app",
		);
		expect(normalizeAbsoluteBaseUrl("   ")).toBe("");
		expect(normalizeAbsoluteBaseUrl("mailto:test@example.com")).toBe("");
		expect(normalizeAbsoluteBaseUrl("prefixhttps://example.com")).toBe("");
		expect(normalizeAbsoluteBaseUrl("")).toBe("");
		expect(normalizeAbsoluteBaseUrl(null)).toBe("");
		expect(normalizeAbsoluteBaseUrl({})).toBe("");
	});

	test("normalizeHeaderCandidate returns the first trimmed string candidate", () => {
		expect(normalizeHeaderCandidate(" value ")).toBe("value");
		expect(normalizeHeaderCandidate(["", " api.example.com "])).toBe("api.example.com");
		expect(normalizeHeaderCandidate(["", 1, ""])).toBe("");
		expect(normalizeHeaderCandidate(42)).toBe("");
	});

	test("readHeaderValue supports case-insensitive keys, arrays, and trimming", () => {
		expect(
			readHeaderValue(
				{
					Host: " example.com ",
				},
				"host",
			),
		).toBe("example.com");
		expect(
			readHeaderValue(
				{
					"x-forwarded-host": ["", " api.example.com "],
				},
				"x-forwarded-host",
			),
		).toBe("api.example.com");
		expect(
			readHeaderValue(
				{
					"X-Forwarded-Host": ["  ", "edge.example.com"],
				},
				"x-forwarded-host",
			),
		).toBe("edge.example.com");
		expect(
			readHeaderValue(
				{
					Host: "   ",
					host: "example.com",
				},
				"host",
			),
		).toBe("example.com");
		expect(
			readHeaderValue(
				{
					"X-Test": ["  ", 42, " final "],
				},
				"x-test",
			),
		).toBe("final");
		expect(readHeaderValue("not headers", "host")).toBe("");
		expect(readHeaderValue([], "host")).toBe("");
		expect(readHeaderValue(null, "host")).toBe("");
		expect(readHeaderValue({}, "host")).toBe("");
	});

	test("normalizeForwardedValue picks the first forwarded item and trims it", () => {
		expect(normalizeForwardedValue(" https, http ")).toBe("https");
		expect(normalizeForwardedValue("example.com")).toBe("example.com");
		expect(normalizeForwardedValue(" , second.example.com")).toBe("");
		expect(normalizeForwardedValue("")).toBe("");
		expect(normalizeForwardedValue(null)).toBe("");
	});

	test("parseCfVisitorScheme extracts only valid JSON-like scheme values", () => {
		expect(parseCfVisitorScheme("{\"scheme\":\"https\"}")).toBe("https");
		expect(parseCfVisitorScheme("{\"scheme\" : \"HTTP\"}")).toBe("http");
		expect(parseCfVisitorScheme("   {\"scheme\":\"https\"}   ")).toBe("https");
		expect(parseCfVisitorScheme("{\"scheme\":\" ws \"}")).toBe("");
		expect(parseCfVisitorScheme("{\"other\":\"https\"}")).toBe("");
		expect(parseCfVisitorScheme("{\"scheme\":1}")).toBe("");
		expect(parseCfVisitorScheme("{\"scheme\":\" https \"}")).toBe("https");
		expect(parseCfVisitorScheme("prefix{\"scheme\":\"https\"}")).toBe("");
		expect(parseCfVisitorScheme("{\"scheme\":\"https\"}suffix")).toBe("");
		expect(parseCfVisitorScheme("{invalid")).toBe("");
		expect(parseCfVisitorScheme("")).toBe("");
		expect(parseCfVisitorScheme(null)).toBe("");
	});

	test("isLocalHost recognizes localhost and loopback hosts only", () => {
		expect(isLocalHost("localhost")).toBe(true);
		expect(isLocalHost(" localhost ")).toBe(true);
		expect(isLocalHost("localhost:8787")).toBe(true);
		expect(isLocalHost("127.0.0.1")).toBe(true);
		expect(isLocalHost("127.0.0.1:8787")).toBe(true);
		expect(isLocalHost("[::1]")).toBe(true);
		expect(isLocalHost("[::1]:8787")).toBe(true);
		expect(isLocalHost("example.com")).toBe(false);
	});

	test("hasSafeHostShape rejects empty or unsafe host strings", () => {
		expect(hasSafeHostShape("app.example.com")).toBe(true);
		expect(hasSafeHostShape("localhost:8787")).toBe(true);
		expect(hasSafeHostShape("")).toBe(false);
		expect(hasSafeHostShape("bad host")).toBe(false);
		expect(hasSafeHostShape("bad/host")).toBe(false);
		expect(hasSafeHostShape("bad?host")).toBe(false);
		expect(hasSafeHostShape("bad#host")).toBe(false);
		expect(hasSafeHostShape("bad@host")).toBe(false);
	});

	test("isKnownHttpScheme only accepts http and https", () => {
		expect(isKnownHttpScheme("http")).toBe(true);
		expect(isKnownHttpScheme("https")).toBe(true);
		expect(isKnownHttpScheme("HTTP")).toBe(false);
		expect(isKnownHttpScheme("ws")).toBe(false);
		expect(isKnownHttpScheme("")).toBe(false);
	});

	test("resolveScheme prefers forwarded proto, then cf-visitor, then host default", () => {
		expect(resolveScheme("https", "http", "localhost:8787")).toBe("https");
		expect(resolveScheme("", "https", "localhost:8787")).toBe("https");
		expect(resolveScheme("", "", "localhost:8787")).toBe("http");
		expect(resolveScheme("", "", "app.example.com")).toBe("https");
	});

	test("resolveEnableAutoUpdatesBaseUrl derives an https origin from forwarded headers", () => {
		expect(
			resolveEnableAutoUpdatesBaseUrl({
				host: "lore.example.com",
				"x-forwarded-proto": "https",
			}),
		).toBe("https://lore.example.com");
	});

	test("resolveEnableAutoUpdatesBaseUrl prefers forwarded host and trims case-insensitive array values", () => {
		expect(
			resolveEnableAutoUpdatesBaseUrl({
				Host: "ignored.example.com",
				"X-Forwarded-Host": [" app.example.com ", ""],
				"X-Forwarded-Proto": " https, http ",
			}),
		).toBe("https://app.example.com");
	});

	test("resolveEnableAutoUpdatesBaseUrl falls back to cf-visitor scheme", () => {
		expect(
			resolveEnableAutoUpdatesBaseUrl({
				host: "lore.example.com",
				"cf-visitor": "{\"scheme\":\"https\"}",
			}),
		).toBe("https://lore.example.com");
	});

	test("resolveEnableAutoUpdatesBaseUrl normalizes uppercase forwarded proto", () => {
		expect(
			resolveEnableAutoUpdatesBaseUrl({
				host: "localhost:8787",
				"x-forwarded-proto": "HTTPS",
			}),
		).toBe("https://localhost:8787");
	});

	test("resolveEnableAutoUpdatesBaseUrl uses cf-visitor when forwarded proto is invalid", () => {
		expect(
			resolveEnableAutoUpdatesBaseUrl({
				host: "localhost:8787",
				"x-forwarded-proto": "ws",
				"cf-visitor": "{\"scheme\":\"https\"}",
			}),
		).toBe("https://localhost:8787");
	});

	test("resolveEnableAutoUpdatesBaseUrl uses http for localhost when no proxy scheme is present", () => {
		expect(
			resolveEnableAutoUpdatesBaseUrl({
				host: "localhost:8787",
			}),
		).toBe("http://localhost:8787");
	});

	test("resolveEnableAutoUpdatesBaseUrl uses http for loopback IPs with no proxy scheme", () => {
		expect(resolveEnableAutoUpdatesBaseUrl({ host: "127.0.0.1:8787" })).toBe(
			"http://127.0.0.1:8787",
		);
		expect(resolveEnableAutoUpdatesBaseUrl({ host: "[::1]:8787" })).toBe(
			"http://[::1]:8787",
		);
	});

	test("resolveEnableAutoUpdatesBaseUrl defaults to https for non-local hosts without proxy scheme", () => {
		expect(resolveEnableAutoUpdatesBaseUrl({ host: "app.example.com" })).toBe(
			"https://app.example.com",
		);
	});

	test("resolveEnableAutoUpdatesBaseUrl returns empty string when no usable host is present", () => {
		expect(resolveEnableAutoUpdatesBaseUrl({})).toBe("");
		expect(resolveEnableAutoUpdatesBaseUrl(null)).toBe("");
		expect(resolveEnableAutoUpdatesBaseUrl({ host: "" })).toBe("");
		expect(resolveEnableAutoUpdatesBaseUrl({ host: "bad/host" })).toBe("");
		expect(
			resolveEnableAutoUpdatesBaseUrl({
				host: "bad host value",
			}),
		).toBe("");
	});
});
