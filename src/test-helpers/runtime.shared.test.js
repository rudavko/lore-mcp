/** @implements NFR-001 — Shared test-only helpers for assembling std dependencies without widening unit-test imports. */
import { createStd } from "../lib/std.pure.js";

export function createBaseStd(root) {
	return createStd(root);
}

export function createTestStd(deps) {
	return {
		...deps.baseStd,
		Date: deps.Date,
		Object: deps.Object,
		atob: deps.atob,
		btoa: deps.btoa,
	};
}

export function createGlobalTestStd(root) {
	return createTestStd({
		baseStd: createBaseStd(root),
		Date: root.Date,
		Object: root.Object,
		atob: root.atob.bind(root),
		btoa: root.btoa.bind(root),
	});
}
