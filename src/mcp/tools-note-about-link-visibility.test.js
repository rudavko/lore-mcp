/** @implements FR-003 — RED regression for invisible implicit about-link creation in note responses. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
import { zStub } from "../test-helpers/mcp-zod-stub.helper.js";

const std = createGlobalTestStd(globalThis);

describe("mcp/tools note about-link visibility regression", () => {
	test("object_create note visibly marks the implicit about link in the response", async () => {
		const handlers = {};
		registerTools(
			{
				tool: (name, _description, _schema, handler) => {
					handlers[name] = handler;
				},
			},
			{
				z: zStub,
				std,
				formatResult: (_text, data) => data,
				formatError: (error) => error,
				checkPolicy: async () => undefined,
				createAndEmbed: async (entryArgs) => ({
					id: "note-1",
					...entryArgs,
					embedding_status: "pending",
					created_at: "2026-03-30T00:00:00.000Z",
					updated_at: "2026-03-30T00:00:00.000Z",
				}),
				upsertTriple: async (args) => ({
					created: true,
					triple: {
						id: "triple-1",
						subject: args.subject,
						predicate: args.predicate,
						object: args.object,
						source: args.source ?? null,
						confidence: args.confidence ?? null,
						valid_from: args.valid_from ?? null,
						valid_to: args.valid_to ?? null,
						valid_to_state: "unspecified",
						created_at: "2026-03-30T00:00:00.000Z",
					},
				}),
				notifyResourceChange: () => undefined,
				isPredicateMulti: () => false,
			},
		);

		const result = await handlers.object_create({
			kind: "note",
			payload: {
				body: "AX note body",
			},
			about: "entity-1",
		});

		expect(result.links[0]).toMatchObject({
			predicate: "about",
			object: "entity-1",
			auto: true,
		});
	});
});
