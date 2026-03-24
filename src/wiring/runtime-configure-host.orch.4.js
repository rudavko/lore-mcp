/** @implements FR-001 — Host-scoped server configuration inputs. */
function createCoreHostDeps(env) {
	return {
		multiValuePredicates:
			typeof env.MULTI_VALUE_PREDICATES === "string" ? env.MULTI_VALUE_PREDICATES : "",
	};
}

export { createCoreHostDeps };
