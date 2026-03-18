/** @implements NFR-001 — Verify error factory functions and Result helpers. */
import { describe, test, expect } from "bun:test";
import {
	validationError,
	notFoundError,
	conflictError,
	policyError,
	dependencyError,
	internalError,
	ok,
	err,
	isOk,
	isErr,
} from "./errors.pure.js";
describe("Error factories", () => {
	test("validationError creates correct shape", () => {
		const e = validationError("bad input");
		expect(e.code).toBe("validation");
		expect(e.message).toBe("bad input");
		expect(e.retryable).toBe(false);
	});
	test("notFoundError creates correct shape", () => {
		const e = notFoundError("missing");
		expect(e.code).toBe("not_found");
		expect(e.retryable).toBe(false);
	});
	test("conflictError creates correct shape", () => {
		const e = conflictError("duplicate");
		expect(e.code).toBe("conflict");
		expect(e.retryable).toBe(false);
	});
	test("policyError creates correct shape", () => {
		const e = policyError("denied");
		expect(e.code).toBe("policy");
		expect(e.retryable).toBe(false);
	});
	test("dependencyError creates correct shape", () => {
		const e = dependencyError("db down");
		expect(e.code).toBe("dependency");
		expect(e.retryable).toBe(true);
	});
	test("internalError creates correct shape", () => {
		const e = internalError("oops");
		expect(e.code).toBe("internal");
		expect(e.retryable).toBe(false);
	});
});
describe("Result helpers", () => {
	test("ok wraps value", () => {
		const r = ok(42);
		expect(r.ok).toBe(true);
		expect(isOk(r)).toBe(true);
		expect(isErr(r)).toBe(false);
		if (r.ok) expect(r.value).toBe(42);
	});
	test("err wraps error", () => {
		const e = validationError("bad");
		const r = err(e);
		expect(r.ok).toBe(false);
		expect(isOk(r)).toBe(false);
		expect(isErr(r)).toBe(true);
		if (!r.ok) expect(r.error.code).toBe("validation");
	});
});
