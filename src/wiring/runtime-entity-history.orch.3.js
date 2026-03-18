/** @implements FR-001 — Entity merge/query and transaction-history runtime orchestration. */
import {
	decodeCursor,
	encodeCursor,
	jsonStringifyOrNull,
	noThrowValidation,
	nowIso,
	throwNotFoundValue,
	validationError,
} from "./runtime-value-helpers.orch.3.js";

function buildEntityAndHistoryOps(ctx) {
	const lookupEntity = async (id) => {
		const row = await ctx.selectEntityRow(ctx.db, id);
		if (row === null) {
			throw throwNotFoundValue("Entity", id);
		}
		return ctx.rowToEntity(row);
	};
	const collectMergeData = async (mergeId, mergeName) => {
		const toIds = (rows) => {
			const ids = [];
			for (let i = 0; i < rows.length; i++) {
				if (typeof rows[i].id === "string") {
					ids.push(rows[i].id);
				}
			}
			return ids;
		};
		return {
			subjTripleIds: toIds(await ctx.selectTripleIdsBySubject(ctx.db, mergeName)),
			objTripleIds: toIds(await ctx.selectTripleIdsByObject(ctx.db, mergeName)),
			mergeEntryIds: toIds(await ctx.selectEntryIdsByEntity(ctx.db, mergeId)),
			mergeAliasIds: toIds(await ctx.selectAliasIdsByEntity(ctx.db, mergeId)),
		};
	};
	const executeMergeBatch = async ({
		keepName,
		mergeName,
		keepId,
		mergeId,
		txId,
		beforeSnapshot,
		now,
	}) => {
		const aliasId = ctx.generateId();
		await ctx.db.batch([
			ctx.db
				.prepare(`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
				 VALUES (?, 'MERGE', 'entity', ?, ?, NULL, ?)`)
				.bind(txId, keepId, beforeSnapshot, now),
			ctx.db.prepare(`UPDATE triples SET subject = ? WHERE subject = ? AND deleted_at IS NULL`).bind(keepName, mergeName),
			ctx.db.prepare(`UPDATE triples SET object = ? WHERE object = ? AND deleted_at IS NULL`).bind(keepName, mergeName),
			ctx.db.prepare(`UPDATE entries SET canonical_entity_id = ? WHERE canonical_entity_id = ?`).bind(keepId, mergeId),
			ctx.db.prepare(`UPDATE entity_aliases SET canonical_entity_id = ? WHERE canonical_entity_id = ?`).bind(keepId, mergeId),
			ctx.db.prepare(
				`INSERT OR IGNORE INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES (?, ?, ?, ?)`,
			).bind(aliasId, mergeName.toLowerCase(), keepId, now),
			ctx.db.prepare(`DELETE FROM canonical_entities WHERE id = ?`).bind(mergeId),
		]);
	};
	const upsertEntity = async (name) => {
		return await ctx.upsertEntityOrch(name, {
			resolveAliasRow: ctx.resolveAliasRow,
			selectEntityByName: ctx.selectEntityByName,
			insertEntityRow: ctx.insertEntityRow,
			rowToEntity: ctx.rowToEntity,
			buildEntityObject: ctx.buildEntityObject,
			generateId: ctx.generateId,
			now: () => nowIso(ctx.std),
			serialize: (value) => jsonStringifyOrNull(value, ctx.std),
			db: ctx.db,
		});
	};
	const mergeEntities = async (keepId, mergeId) => {
		if (keepId === mergeId) {
			throw validationError("Cannot merge entity with itself");
		}
		return await ctx.mergeEntitiesOrch(keepId, mergeId, {
			lookupEntity,
			collectMergeData,
			executeMergeBatch,
			buildMergeSnapshot: ctx.buildMergeSnapshot,
			generateId: ctx.generateId,
			now: () => nowIso(ctx.std),
			serialize: (value) => jsonStringifyOrNull(value, ctx.std),
			throwValidation: noThrowValidation,
		});
	};
	const queryEntities = async (params) => {
		return await ctx.queryEntitiesOrch(params, {
			buildEntityQueryState: ctx.buildEntityQueryState,
			buildEntityQueryItems: ctx.buildEntityQueryItems,
			queryCanonicalEntityRows: ctx.queryCanonicalEntityRows,
			queryAliasRowsByEntityIds: ctx.queryAliasRowsByEntityIds,
			decodeCursor: (raw) => decodeCursor(raw, ctx.std),
			encodeCursor: (value) => encodeCursor(value, ctx.std),
			db: ctx.db,
		});
	};
	const revertTransaction = async (tx, revertId, now) => {
		const parseSnapshot = (raw) => {
			if (typeof raw !== "string" || raw.length === 0) {
				return null;
			}
			const parsed = ctx.std.json.parse(raw);
			return parsed.ok && typeof parsed.value === "object" && parsed.value !== null
				? parsed.value
				: null;
		};
		await ctx.executeBatch(
			ctx.db,
			ctx.buildUndoStatements({
				op: tx.op,
				entityType: tx.entity_type,
				entityId: tx.entity_id,
				beforeSnapshot: parseSnapshot(tx.before_snapshot),
				afterSnapshot: parseSnapshot(tx.after_snapshot),
				revertId,
				txId: tx.id,
				now,
			}),
		);
	};
	const undoTransactions = async (count) => {
		return await ctx.undoTransactionsOrch(count, {
			selectRevertableTransactions: ctx.selectRevertableTransactions,
			revertTransaction,
			rowToTransaction: ctx.rowToTransaction,
			generateId: ctx.generateId,
			now: () => nowIso(ctx.std),
			db: ctx.db,
		});
	};
	const getHistory = async (params) => {
		return await ctx.getHistoryOrch(params, {
			buildSql: (p, decodedCursor, limit) => {
				const { conditions, binds } = ctx.buildHistoryQueryConditions(p, decodedCursor);
				let sql = "SELECT * FROM transactions";
				if (conditions.length > 0) {
					sql += " WHERE " + conditions.join(" AND ");
				}
				sql += " ORDER BY created_at DESC, id DESC LIMIT ?";
				return { sql, binds: [...binds, limit] };
			},
			queryTransactionRows: ctx.queryTransactionRows,
			rowToTransaction: ctx.rowToTransaction,
			decodeCursor: (raw) => decodeCursor(raw, ctx.std),
			encodeCursor: (value) => encodeCursor(value, ctx.std),
			db: ctx.db,
		});
	};
	return { getHistory, mergeEntities, queryEntities, undoTransactions, upsertEntity };
}

export { buildEntityAndHistoryOps };
