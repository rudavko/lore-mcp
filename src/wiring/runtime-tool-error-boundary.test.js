/** @implements NFR-002 — Verify runtime tool error boundaries preserve reliable failure signaling. */
import { describe, expect, test } from "bun:test";
import { encodeUriComponentValue, wrapToolHandler } from "./runtime.orch.1.js";
describe("wiring/runtime.efct wrapToolHandler", () => {
	test("converts async handler rejection into formatted error payload", async () => {
		const expectedError = {
			code: "not_found",
			message: "Entry missing not found",
			retryable: false,
		};
		const wrapped = wrapToolHandler(
			async () => Promise.reject(expectedError),
			(err) => ({ formatted: true, err }),
		);
		const result = await wrapped({});
		expect(result).toEqual({ formatted: true, err: expectedError });
	});

	test("forwards request extra metadata into the wrapped tool handler", async () => {
		const wrapped = wrapToolHandler(
			async (_args, extra) => ({
				requestInfo: extra.requestInfo,
				requestId: extra.requestId,
			}),
			(err) => ({ formatted: true, err }),
		);
		const extra = {
			requestId: "req-1",
			requestInfo: {
				headers: {
					host: "lore.example.com",
				},
			},
		};
		const result = await wrapped({}, extra);
		expect(result).toEqual({
			requestId: "req-1",
			requestInfo: {
				headers: {
					host: "lore.example.com",
				},
			},
		});
	});

	test("unwraps std uri encoding helpers to a plain string value", () => {
		expect(
			encodeUriComponentValue("token 123", {
				uri: {
					encodeURIComponent: (value) => ({ ok: true, value: value.replace(" ", "%20") }),
				},
			}),
		).toBe("token%20123");
	});
});
