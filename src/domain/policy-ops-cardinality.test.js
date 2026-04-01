/** @implements FR-005, FR-006 — Verify predicate cardinality policy behavior used by relate/upsert conflict handling. */
import { describe, expect, test } from "bun:test";
import { createPolicyChecker } from "./policy.ops.efct.js";
import { createBaseStd } from "../test-helpers/runtime.shared.helper.js";
const DEFAULT_REQUIRED_FIELDS = {
	store: ["topic", "content"],
	relate: ["subject", "predicate", "object"],
	update_triple: ["id"],
	upsert_triple: ["subject", "predicate", "object"],
	merge_entities: ["keepId", "mergeId"],
};
const validateRequiredFields = (requiredFields, op, params) => {
	const fields = requiredFields[op];
	if (fields === undefined) {
		return null;
	}
	for (let i = 0; i < fields.length; i++) {
		const field = fields[i];
		const value = params[field];
		if (value === undefined || value === null || value === "") {
			return "Policy violation: '" + field + "' is required for '" + op + "'";
		}
	}
	return null;
};
const validateMinConfidence = (minConfidence, confidence) => {
	if (confidence === undefined) {
		return null;
	}
	if (minConfidence > 0 && confidence < minConfidence) {
		return "Policy violation: confidence " + confidence + " is below minimum " + minConfidence;
	}
	return null;
};
describe("domain/policy.ops predicate cardinality", () => {
	test("returns multi=true only for configured predicates", () => {
		const checker = createPolicyChecker({
			std: createBaseStd(globalThis),
			logEvent: () => {},
			throwPolicy: () => {},
			defaultRequiredFields: DEFAULT_REQUIRED_FIELDS,
			validateRequiredFields,
			validateMinConfidence,
		});
		checker.setPolicy({
			predicateCardinality: {
				tag: "multi",
				version: "single",
			},
		});
		expect(checker.isPredicateMulti("tag")).toBe(true);
		expect(checker.isPredicateMulti("version")).toBe(false);
		expect(checker.isPredicateMulti("unknown")).toBe(false);
	});
});
