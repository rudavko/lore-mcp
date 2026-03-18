/** @implements FR-002, FR-004 — Shared helpers for query response normalization tests. */
import { createGlobalTestStd } from "../test-helpers/runtime.shared.test.js";

export const std = createGlobalTestStd(globalThis);

export function normalizeValidToState(rawState, validTo) {
	if (rawState === "unspecified" || rawState === "infinite" || rawState === "bounded") {
		return rawState;
	}
	return validTo === null ? "unspecified" : "bounded";
}
