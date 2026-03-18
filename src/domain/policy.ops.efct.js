/** @implements NFR-001 — Policy effect state and validation wiring via injected pure delegates. */
/** Sentinel for TDD hook. */
export const _MODULE = "policy.efct";
const DEFAULT_MIN_CONFIDENCE = 0;
function cloneRequiredFields(std, source) {
	const out = {};
	const keys = std.Object.keys(source);
	for (let i = 0; i < keys.length; i++) {
		const k = keys[i];
		const arr = source[k];
		const copy = [];
		for (let j = 0; j < arr.length; j++) {
			copy.push(arr[j]);
		}
		out[k] = copy;
	}
	return out;
}
// CONTEXT: getPolicy returns a snapshot copy of the current config (not a live reference).
// Callers cannot mutate internal state through the returned object because requiredFields
// is rebuilt as a new record on each getPolicy call.
/** Create a policy checker with injected side-effect handlers.
 *  Returns an object with checkPolicy, getPolicy, setPolicy, resetPolicy. */
export function createPolicyChecker(deps) {
	let minConfidence = DEFAULT_MIN_CONFIDENCE;
	let requiredFields = cloneRequiredFields(deps.std, deps.defaultRequiredFields);
	let predicateCardinality = {};
	function checkPolicy(op, params) {
		const requiredError = deps.validateRequiredFields(requiredFields, op, params);
		if (requiredError !== null) {
			deps.logEvent("policy_rejection", { op: op, reason: "required" });
			deps.throwPolicy(requiredError);
			return;
		}
		const confidenceValue =
			typeof params.confidence === "number" ? params.confidence : undefined;
		const confidenceError = deps.validateMinConfidence(minConfidence, confidenceValue);
		if (confidenceError !== null) {
			deps.logEvent("policy_rejection", {
				op: op,
				confidence: confidenceValue,
				min: minConfidence,
				reason: "low_confidence",
			});
			deps.throwPolicy(confidenceError);
			return;
		}
	}
	function getPolicy() {
		/* Return a defensive copy so callers cannot mutate internal state. */
		const fieldsCopy = {};
		const rkeys = deps.std.Object.keys(requiredFields);
		for (let i = 0; i < rkeys.length; i++) {
			const k = rkeys[i];
			const arr = requiredFields[k];
			const copy = [];
			for (let j = 0; j < arr.length; j++) {
				copy.push(arr[j]);
			}
			fieldsCopy[k] = copy;
		}
		const cardinalityCopy = {};
		const ckeys = deps.std.Object.keys(predicateCardinality);
		for (let i = 0; i < ckeys.length; i++) {
			const k = ckeys[i];
			cardinalityCopy[k] = predicateCardinality[k];
		}
		return {
			minConfidence: minConfidence,
			requiredFields: fieldsCopy,
			predicateCardinality: cardinalityCopy,
		};
	}
	function setPolicy(config) {
		if (config.minConfidence !== undefined) {
			minConfidence = config.minConfidence;
		}
		if (config.requiredFields !== undefined) {
			requiredFields = config.requiredFields;
		}
		if (config.predicateCardinality !== undefined) {
			predicateCardinality = config.predicateCardinality;
		}
	}
	function isPredicateMulti(predicate) {
		return predicateCardinality[predicate] === "multi";
	}
	function resetPolicy() {
		minConfidence = DEFAULT_MIN_CONFIDENCE;
		requiredFields = cloneRequiredFields(deps.std, deps.defaultRequiredFields);
		predicateCardinality = {};
	}
	return { checkPolicy, getPolicy, setPolicy, resetPolicy, isPredicateMulti };
}
