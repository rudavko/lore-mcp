/** @implements NFR-001 — Shared Zod-like stub for MCP surface tests. */
function chain() {
	return {
		optional: () => chain(),
		describe: () => chain(),
		min: () => chain(),
		max: () => chain(),
		int: () => chain(),
		shape: {},
	};
}

export const zStub = {
	string: () => chain(),
	number: () => chain(),
	boolean: () => chain(),
	array: () => chain(),
	enum: () => chain(),
	object: (shape) => ({ ...chain(), shape }),
};
