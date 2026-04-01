/** @implements NFR-001 — Pure mutation policy validation: required fields, confidence thresholds. */
export function defaultRequiredFields() {
	return {
		store: ["topic", "content"],
		relate: ["subject", "predicate", "object"],
		update_triple: ["id"],
		upsert_triple: ["subject", "predicate", "object"],
		merge_entities: ["keepId", "mergeId"],
	};
}
/** Validate that all required fields for an operation are present and non-empty.
 *  Returns an error message string if validation fails, or null if all fields pass. */
export function validateRequiredFields(requiredFields, op, params) {
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
}
/** Validate that a confidence value meets the minimum threshold.
 *  Returns an error message string if below minimum, or null if acceptable. */
export function validateMinConfidence(minConfidence, confidence) {
	if (confidence === undefined) {
		return null;
	}
	if (minConfidence > 0 && confidence < minConfidence) {
		return "Policy violation: confidence " + confidence + " is below minimum " + minConfidence;
	}
	return null;
}
