/** @implements FR-001, FR-003 — RED regression for note creation polluting the canonical entity namespace. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
import { zStub } from "../test-helpers/mcp-zod-stub.helper.js";
import { createInitializedD1 } from "../test-helpers/db-d1.helper.js";
import { createEntry } from "../db/entries.ops.efct.js";
import {
	validateCreateEntryInput,
	resolveCreateAutoLinkState,
	buildCreateSnapshots,
	resolveTopicCanonicalEntityId,
} from "../db/entries-autolink.efct.js";
import { validateEntryFields, buildEntryObject } from "../db/entries.pure.js";
import { insertEntryRow } from "../db/entries.efct.js";
import { deriveValidToStateFromInput } from "../lib/validity.pure.js";
import { makeResolveCanonicalEntityIdForCreate } from "../wiring/runtime-resolve-entity.orch.4.js";
import {
	resolveAliasRow,
	selectEntityByName,
	queryCanonicalEntityRows,
	queryAliasRowsByEntityIds,
} from "../db/entities-read.efct.js";
import { queryEntities } from "../db/entities.ops.efct.js";
import { buildEntityQueryState, buildEntityQueryItems } from "../db/entities.pure.js";

const std = createGlobalTestStd(globalThis);

function createIdGenerator() {
	let next = 1;
	return () => "id-" + next++;
}

function createObjectCreateHandlers(createAndEmbed) {
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
			createAndEmbed,
			notifyResourceChange: () => undefined,
			isPredicateMulti: () => false,
			upsertTriple: async () => {
				throw new Error("not expected");
			},
		},
	);
	return handlers;
}

describe("mcp/tools note phantom canonical entity regression", () => {
	test("object_create note does not auto-create a canonical entity from the note body", async () => {
		const { db } = await createInitializedD1();
		const generateId = createIdGenerator();
		const resolveCanonicalEntityIdForCreate = makeResolveCanonicalEntityIdForCreate({
			db,
			generateId,
			resolveAliasRow,
			selectEntityByName,
		});
		const handlers = createObjectCreateHandlers(async (entryArgs) =>
			await createEntry(entryArgs, {
				validateEntryFields,
				deriveValidToStateFromInput,
				resolveCanonicalEntityIdForCreate,
				buildEntryObject,
				insertEntryRow,
				generateId,
				now: () => "2026-03-30T00:00:00.000Z",
				computeExpiresAt: (_now, _ttlSeconds) => null,
				serialize: JSON.stringify,
				db,
				throwValidation: (message) => {
					throw new Error(message);
				},
				validateCreateEntryInput,
				resolveCreateAutoLinkState,
				buildCreateSnapshots,
				resolveTopicCanonicalEntityId,
			}),
		);
		const noteBody = "AX audit note: testing note creation";

		await handlers.object_create({
			kind: "note",
			payload: {
				body: noteBody,
			},
		});

		const entities = await queryEntities(
			{ limit: 10 },
			{
				buildEntityQueryState,
				buildEntityQueryItems,
				queryCanonicalEntityRows,
				queryAliasRowsByEntityIds,
				decodeCursor: (cursor) => (cursor ? atob(cursor) : null),
				encodeCursor: (id) => btoa(id),
				db,
			},
		);

		expect(entities.items).toEqual([]);
	});
});
