/** @implements FR-001 — Runtime error/value constructors for orchestration layers. */
function makeDomainError(code, message, retryable) {
	return { code, message, retryable };
}

function validationError(message) {
	return makeDomainError("validation", message, false);
}

function policyError(message) {
	return makeDomainError("policy", message, false);
}

function throwNotFoundValue(type, id) {
	return makeDomainError("not_found", type + " " + id + " not found", false);
}

function noThrowValidation(_message) {
	return undefined;
}

function parseError(err, std) {
	if (typeof err === "object" && err !== null) {
		const asRec = err;
		if (typeof asRec.code === "string" && typeof asRec.message === "string") {
			return {
				code: asRec.code,
				message: asRec.message,
				retryable: asRec.retryable === true,
			};
		}
	}
	if (typeof err === "object" && err !== null && "message" in err) {
		const asMessage = err.message;
		if (typeof asMessage === "string") {
			return { code: "internal", message: asMessage, retryable: false };
		}
	}
	return { code: "internal", message: std.String(err), retryable: false };
}

export {
	noThrowValidation,
	parseError,
	policyError,
	throwNotFoundValue,
	validationError,
};
