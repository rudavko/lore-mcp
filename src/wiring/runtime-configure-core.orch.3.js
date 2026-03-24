/** @implements FR-001 — Core shared services for server configuration runtime wiring. */
import { parseMultiPredicateConfig, policyError } from "./runtime-value-helpers.orch.3.js";
import {
	createUlidGenerator,
	makeBuildEntryMapper,
	makeFormatError,
	makeFormatResult,
	makeNotifyResourceChange,
} from "./runtime-surface.orch.3.js";

function createWiringCore(deps) {
	const generateId = createUlidGenerator(deps.formatUlid, deps.nowMs, deps.random, deps.std.Math.floor);
	const mapEntryRow = makeBuildEntryMapper(deps.rowToEntry, deps.std);
	const notifyResourceChange = makeNotifyResourceChange(
		deps.serverRecord,
		deps.resolveEntityUri,
		deps.transactionsUri,
	);
	const formatResult = makeFormatResult(deps.textResult, deps.jsonResource, deps.std);
	const formatError = makeFormatError(deps.errorResult, deps.std);
	const logEvent = (event, data) => {
		deps.observeLogEvent(
			deps.logSink,
			{
				event,
				ts: deps.nowMs(),
				...(typeof data === "object" && data !== null ? data : { data }),
			},
			deps.std,
		);
	};
	let pendingPolicyError = null;
	const policy = deps.createPolicyChecker({
		std: deps.std,
		logEvent,
		throwPolicy: (msg) => {
			pendingPolicyError = policyError(msg);
		},
		defaultRequiredFields: deps.defaultRequiredFields,
		validateRequiredFields: deps.validateRequiredFields,
		validateMinConfidence: deps.validateMinConfidence,
	});
	const multiPredicateConfig = parseMultiPredicateConfig(deps.multiValuePredicates, deps.std);
	if (deps.std.Object.keys(multiPredicateConfig).length > 0 && typeof policy.setPolicy === "function") {
		policy.setPolicy({ predicateCardinality: multiPredicateConfig });
	}
	const checkPolicy = async (op, params) => {
		pendingPolicyError = null;
		policy.checkPolicy(op, params);
		if (pendingPolicyError !== null) {
			throw pendingPolicyError;
		}
	};
	const isPredicateMulti = (predicate) => {
		return typeof policy.isPredicateMulti === "function" ? policy.isPredicateMulti(predicate) : false;
	};
	return {
		checkPolicy,
		formatError,
		formatResult,
		generateId,
		isPredicateMulti,
		logEvent,
		mapEntryRow,
		notifyResourceChange,
	};
}

export { createWiringCore };
