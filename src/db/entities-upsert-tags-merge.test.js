/** @implements FR-003 — RED regression for entity upsert tag merge behavior. */
import { describe, expect, test } from "bun:test";
import { createInitializedD1 } from "../test-helpers/db-d1.helper.js";
import { upsertEntity } from "./entities.ops.efct.js";
import { rowToEntity, buildEntityObject } from "./entities.pure.js";
import { resolveAliasRow, selectEntityByName } from "./entities-read.efct.js";
import { insertEntityRow, updateEntityRow } from "./entities-write.efct.js";

function createIdGenerator() {
	let next = 1;
	return () => "id-" + next++;
}

describe("db/entities upsert tag merging regression", () => {
	test("upserting an existing entity merges tags instead of replacing them", async () => {
		const { db } = await createInitializedD1();
		const generateId = createIdGenerator();
		const deps = {
			db,
			resolveAliasRow,
			selectEntityByName,
			rowToEntity: (row) => rowToEntity(row, JSON.parse),
			now: () => "2026-03-30T00:00:00.000Z",
			generateId,
			buildEntityObject,
			serialize: JSON.stringify,
			insertEntityRow,
			updateEntityRow,
		};

		await upsertEntity(
			{
				name: "Release Notes",
				tags: ["a", "b"],
			},
			deps,
		);

		const result = await upsertEntity(
			{
				name: "Release Notes",
				tags: ["c"],
			},
			deps,
		);

		expect(result.entity.tags).toEqual(["a", "b", "c"]);
	});
});
