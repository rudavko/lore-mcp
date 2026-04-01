/** @implements FR-001 — Shared runtime std/app-version builders for worker composition. */
import { createStd } from "./lib/std.pure.js";

export function createRuntimeStd(runtimeGlobal) {
	const baseStd = createStd(runtimeGlobal);
	return {
		...baseStd,
		Date: runtimeGlobal.Date,
		Object: runtimeGlobal.Object,
		atob: runtimeGlobal.atob.bind(runtimeGlobal),
		btoa: runtimeGlobal.btoa.bind(runtimeGlobal),
	};
}
