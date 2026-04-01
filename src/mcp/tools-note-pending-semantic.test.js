/** @implements FR-002, FR-003 — RED regression for pending notes being invisible to semantic retrieve. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
import { zStub } from "../test-helpers/mcp-zod-stub.helper.js";

const std = createGlobalTestStd(globalThis);

describe("mcp/tools pending note semantic retrieve regression", () => {
	test("newly created pending notes remain visible to semantic retrieve before embeddings are ready", async () => {
		const handlers = {};
		const createdNotes = [];
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
				createAndEmbed: async (entryArgs) => {
					const entry = {
						id: "note-1",
						...entryArgs,
						embedding_status: "pending",
						created_at: "2026-03-30T00:00:00.000Z",
						updated_at: "2026-03-30T00:00:00.000Z",
					};
					createdNotes.push(entry);
					return entry;
				},
				hybridSearch: async ({ query }) => {
					const results = [];
					for (let i = 0; i < createdNotes.length; i++) {
						const note = createdNotes[i];
						const queryLower = query.toLowerCase();
						const topicLower = note.topic.toLowerCase();
						const contentLower = note.content.toLowerCase();
						if (topicLower.includes(queryLower) || contentLower.includes(queryLower)) {
							results.push({
								...note,
								score_lexical: 1,
								score_semantic: 0,
								score_graph: 0,
								score_total: 1,
							});
						}
					}
					return { items: results, next_cursor: null };
				},
				queryEntities: async () => ({ items: [], next_cursor: null }),
				queryTriples: async () => ({ items: [], next_cursor: null }),
				notifyResourceChange: () => undefined,
				isPredicateMulti: () => false,
				upsertTriple: async () => {
					throw new Error("not expected");
				},
			},
		);

		await handlers.object_create({
			kind: "note",
			payload: {
				body: "AX audit note: testing note creation",
			},
		});

		const result = await handlers.retrieve({
			query: "compliance verification memo",
			limit: 10,
		});

		expect(result.items.map((item) => item.id)).toContain("note-1");
	});
});
