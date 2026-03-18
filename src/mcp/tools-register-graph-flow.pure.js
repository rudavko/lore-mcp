/** @implements FR-007, FR-009 — Shared graph-tool registration flow for conflict-aware writes. */
import { hasExplicitMulti } from "./tools-core.pure.js";

function runAfterMaybePromise(value, next) {
	if (value && typeof value.then === "function") {
		return value.then(next);
	}
	return next();
}

function buildConflictArgs(args) {
	return {
		subject: args.subject,
		predicate: args.predicate,
		incomingObject: args.object,
		incomingConfidence: args.confidence,
		incomingSource: args.source,
		incomingActor: args.actor,
	};
}

export function runConflictAwareGraphWrite(args, deps) {
	const validityError = deps.validateValidityInterval(args, deps.isInfiniteValidTo, deps.std);
	if (validityError !== null) {
		return deps.formatError(validityError);
	}
	return deps
		.validatePromotionRelation({
			subject: args.subject,
			predicate: args.predicate,
			object: args.object,
		})
		.then(() =>
			runAfterMaybePromise(deps.checkPolicy(deps.policyName, args), () => {
				const predicate = typeof args.predicate === "string" ? args.predicate : "";
				if (hasExplicitMulti(args) || deps.isPredicateMulti(predicate)) {
					return deps.runMulti(args);
				}
				return deps.detectConflict(buildConflictArgs(args)).then((conflict) => {
					if (conflict !== null) {
						return deps.runConflict(args, conflict);
					}
					return deps.runSingle(args);
				});
			}),
		);
}
