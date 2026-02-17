// Mutation guardrails (Spec 003-005).
// Configurable policy rules checked before writes.

import { KnowledgeError } from "../lib/errors";
import { logEvent } from "../lib/observe";

export interface PolicyConfig {
	minConfidence: number;
	requiredFields: Record<string, string[]>;
}

const DEFAULT_POLICY: PolicyConfig = {
	minConfidence: 0.0,
	requiredFields: {
		store: ["topic", "content"],
		relate: ["subject", "predicate", "object"],
		update_triple: ["id"],
		upsert_triple: ["subject", "predicate", "object"],
		merge_entities: ["keepId", "mergeId"],
	},
};

let currentPolicy: PolicyConfig = { ...DEFAULT_POLICY };

export function getPolicy(): PolicyConfig {
	return currentPolicy;
}

export function setPolicy(config: Partial<PolicyConfig>): void {
	currentPolicy = { ...currentPolicy, ...config };
}

export function resetPolicy(): void {
	currentPolicy = { ...DEFAULT_POLICY };
}

export function checkPolicy(
	op: string,
	params: Record<string, unknown>,
): void {
	// Check required fields
	const required = currentPolicy.requiredFields[op];
	if (required) {
		for (const field of required) {
			const value = params[field];
			if (value === undefined || value === null || value === "") {
				logEvent("policy_rejection", { op, field, reason: "required" });
				throw KnowledgeError.policy(
					`Policy violation: '${field}' is required for '${op}'`,
				);
			}
		}
	}

	// Check minimum confidence
	if (
		currentPolicy.minConfidence > 0 &&
		typeof params.confidence === "number" &&
		params.confidence < currentPolicy.minConfidence
	) {
		logEvent("policy_rejection", { op, confidence: params.confidence, min: currentPolicy.minConfidence, reason: "low_confidence" });
		throw KnowledgeError.policy(
			`Policy violation: confidence ${params.confidence} is below minimum ${currentPolicy.minConfidence}`,
		);
	}
}
