// Structured error system for the knowledge server (Spec 002).

export type ErrorCode =
	| "validation"
	| "not_found"
	| "conflict"
	| "policy"
	| "dependency"
	| "internal";

export class KnowledgeError extends Error {
	readonly code: ErrorCode;
	readonly retryable: boolean;

	constructor(code: ErrorCode, message: string, retryable = false) {
		super(message);
		this.name = "KnowledgeError";
		this.code = code;
		this.retryable = retryable;
	}

	static notFound(entity: string, id: string): KnowledgeError {
		return new KnowledgeError("not_found", `${entity} ${id} not found`);
	}

	static validation(message: string): KnowledgeError {
		return new KnowledgeError("validation", message);
	}

	static conflict(message: string): KnowledgeError {
		return new KnowledgeError("conflict", message);
	}

	static policy(message: string): KnowledgeError {
		return new KnowledgeError("policy", message);
	}

	static dependency(message: string): KnowledgeError {
		return new KnowledgeError("dependency", message, true);
	}

	static internal(message: string): KnowledgeError {
		return new KnowledgeError("internal", message, true);
	}
}
