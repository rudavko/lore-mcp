/** @implements FR-003 — RED regression for linking nonexistent objects without validation. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
import { zStub } from "../test-helpers/mcp-zod-stub.helper.js";
import { createInitializedD1 } from "../test-helpers/db-d1.helper.js";
import { upsertTriple, createTriple, updateTriple, findActiveTriples } from "../db/triples.ops.efct.js";
import { validateTripleFields, buildTripleObject, rowToTriple } from "../db/triples.pure.js";
import {
	insertTripleRow,
	updateTripleRow,
	selectTripleRow,
	queryTripleRows,
} from "../db/triples.efct.js";
import { deriveValidToStateFromInput } from "../lib/validity.pure.js";

const std = createGlobalTestStd(globalThis);

function createIdGenerator() {
	let next = 1;
	return () => "id-" + next++;
}

describe("mcp/tools link_object nonexistent reference regression", () => {
	test("link_object rejects links whose subject and object do not exist", async () => {
		const { db } = await createInitializedD1();
		const generateId = createIdGenerator();
		const tripleDeps = {
			db,
			validateTripleFields,
			deriveValidToStateFromInput,
			buildTripleObject,
			insertTripleRow,
			updateTripleRow,
			queryTripleRows,
			rowToTriple,
			serialize: JSON.stringify,
			generateId,
			now: () => "2026-03-30T00:00:00.000Z",
			throwValidation: (message) => {
				throw { code: "validation", message, retryable: false };
			},
			fetchExistingTriple: async (id) => {
				const row = await selectTripleRow(db, id);
				if (row === null) {
					throw { code: "not_found", message: "Triple not found", retryable: false };
				}
				return rowToTriple(row);
			},
		};
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
				checkPolicy: async () => undefined,
				isPredicateMulti: () => false,
				notifyResourceChange: () => undefined,
				formatResult: (_text, data) => data,
				upsertTriple: async (args) =>
					await upsertTriple(args, {
						findActiveTriples: async (subject, predicate) =>
							await findActiveTriples(subject, predicate, tripleDeps),
						createTriple: async (params) => await createTriple(params, tripleDeps),
						updateTriple: async (id, params) => await updateTriple(id, params, tripleDeps),
					}),
			},
		);

		await expect(
			handlers.link_object({
				subject: "missing-subject",
				predicate: "about",
				object: "missing-object",
			}),
		).rejects.toMatchObject({
			code: "validation",
		});
	});
});
