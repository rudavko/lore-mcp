/** @implements NFR-001 — Verify mutation policy guard pure functions. */
import { describe, test, expect } from "bun:test";
import {
	defaultRequiredFields,
	validateRequiredFields,
	validateMinConfidence,
} from "./policy.pure.js";
describe("domain/policy.pure", () => {
	test("defaultRequiredFields covers store and relate", () => {
		const requiredFields = defaultRequiredFields();
		expect(requiredFields["store"].length).toBeGreaterThan(0);
		expect(requiredFields["relate"].length).toBeGreaterThan(0);
	});
	describe("validateRequiredFields", () => {
		test("returns null when all fields present", () => {
			const result = validateRequiredFields(defaultRequiredFields(), "store", {
				topic: "t",
				content: "c",
			});
			expect(result).toBeNull();
		});
		test("returns error string when field missing", () => {
			const result = validateRequiredFields(defaultRequiredFields(), "store", { topic: "t" });
			expect(result).not.toBeNull();
			expect(result.indexOf("content")).toBeGreaterThan(-1);
		});
		test("returns error for empty string field", () => {
			const result = validateRequiredFields(defaultRequiredFields(), "store", {
				topic: "",
				content: "c",
			});
			expect(result).not.toBeNull();
			expect(result.indexOf("topic")).toBeGreaterThan(-1);
		});
		test("returns error for null field", () => {
			const result = validateRequiredFields(defaultRequiredFields(), "store", {
				topic: null,
				content: "c",
			});
			expect(result).not.toBeNull();
		});
		test("returns null for unknown op", () => {
			const result = validateRequiredFields(defaultRequiredFields(), "unknown_op", {});
			expect(result).toBeNull();
		});
		test("checks relate fields", () => {
			const result = validateRequiredFields(defaultRequiredFields(), "relate", {
				subject: "s",
				predicate: "p",
			});
			expect(result).not.toBeNull();
			expect(result.indexOf("object")).toBeGreaterThan(-1);
		});
	});
	describe("validateMinConfidence", () => {
		test("returns null when confidence above minimum", () => {
			expect(validateMinConfidence(0.5, 0.8)).toBeNull();
		});
		test("returns null when confidence equals minimum", () => {
			expect(validateMinConfidence(0.5, 0.5)).toBeNull();
		});
		test("returns error when confidence below minimum", () => {
			const result = validateMinConfidence(0.5, 0.3);
			expect(result).not.toBeNull();
		});
		test("returns null when confidence is undefined", () => {
			expect(validateMinConfidence(0.5, undefined)).toBeNull();
		});
		test("returns null when minimum is zero", () => {
			expect(validateMinConfidence(0, 0)).toBeNull();
		});
	});
});
