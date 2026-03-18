/** @implements FR-001 — Runtime server-surface and formatting helpers. */
import { parseError, parseTags } from "./runtime-value-helpers.orch.3.js";

function createUlidGenerator(formatUlid, nowMs, random, floor) {
	let lastTime = 0;
	const lastRandom = [];
	for (let i = 0; i < 16; i++) {
		lastRandom.push(0);
	}
	return () => {
		const now = nowMs();
		if (now === lastTime) {
			let overflowed = true;
			for (let i = 15; i >= 0; i--) {
				lastRandom[i] = (lastRandom[i] + 1) % 32;
				if (lastRandom[i] !== 0) {
					overflowed = false;
					break;
				}
			}
			if (overflowed) {
				for (let i = 0; i < 16; i++) {
					lastRandom[i] = floor(random() * 32);
				}
				lastTime = now + 1;
			}
		} else {
			lastTime = now;
			for (let i = 0; i < 16; i++) {
				lastRandom[i] = floor(random() * 32);
			}
		}
		return formatUlid(now, lastRandom);
	};
}

function installPrompts(server, deps) {
	const prompt = server.prompt;
	if (!prompt) {
		return;
	}
	prompt.call(
		server,
		"ingest-memory",
		"Guide for storing knowledge with provenance metadata",
		async () => deps.buildIngestMemoryPrompt(),
	);
	prompt.call(
		server,
		"retrieve-context",
		"Guide for querying knowledge with filters and scoring",
		async () => deps.buildRetrieveContextPrompt(),
	);
	prompt.call(
		server,
		"correct-stale-facts",
		"Guide for finding and updating outdated knowledge",
		async () => deps.buildCorrectStaleFactsPrompt(),
	);
}

function installSubscriptions(_server) {
	/* MCP SDK manages resource subscription state internally; no explicit setup needed. */
}

function makeNotifyResourceChange(server, resolveEntityUri, transactionsUri) {
	const sendResourceUpdated = server.server?.sendResourceUpdated;
	if (!sendResourceUpdated) {
		return () => {};
	}
	return (entityType) => {
		try {
			sendResourceUpdated({ uri: resolveEntityUri(entityType) });
			sendResourceUpdated({ uri: transactionsUri });
		} catch {
			/* Non-fatal transport limitation. */
		}
	};
}

function makeFormatResult(textResult, jsonResource, std) {
	return (text, data, uri) => {
		const base = textResult(text);
		if (uri === undefined || data === undefined) {
			return base;
		}
		const resource = jsonResource(uri, data, std);
		return {
			content: [...(base.content || []), ...(resource.content || [])],
		};
	};
}

function makeFormatError(errorResult, std) {
	return (err) => {
		const e = parseError(err, std);
		const payload = std.json.stringify({
			error: e.code,
			message: e.message,
			retryable: e.retryable,
		});
		return errorResult(
			payload.ok
				? payload.value
				: '{"error":"internal","message":"serialization_failed","retryable":false}',
		);
	};
}

function wrapToolHandler(handler, formatError) {
	return (args, extra) => {
		try {
			const result = handler(args, extra);
			if (result && typeof result.then === "function") {
				return result.catch((error) => formatError(error));
			}
			return result;
		} catch (error) {
			return formatError(error);
		}
	};
}

function encodeUriComponentValue(value, std) {
	const encoded = std.uri.encodeURIComponent(value);
	if (encoded && encoded.ok === true && typeof encoded.value === "string") {
		return encoded.value;
	}
	return value;
}

function makeDbQuery(db) {
	return async (sql, binds) => {
		const prepared = db.prepare(sql);
		const runner = binds.length > 0 ? prepared.bind(...binds) : prepared;
		const result = await runner.all();
		return { results: result.results };
	};
}

function makeBuildEntryMapper(rowToEntry, std) {
	return (row) => {
		const mapped = { ...rowToEntry(row, parseTags(row.tags, std)) };
		if (typeof row.embedding_status === "string") {
			mapped.embedding_status = row.embedding_status;
		}
		if (typeof row.embedding_retry_count === "number") {
			mapped.embedding_retry_count = row.embedding_retry_count;
		}
		if (typeof row.embedding_last_error === "string" || row.embedding_last_error === null) {
			mapped.embedding_last_error = row.embedding_last_error;
		}
		if (
			typeof row.embedding_last_attempt_at === "string" ||
			row.embedding_last_attempt_at === null
		) {
			mapped.embedding_last_attempt_at = row.embedding_last_attempt_at;
		}
		return mapped;
	};
}

export {
	createUlidGenerator,
	encodeUriComponentValue,
	installPrompts,
	installSubscriptions,
	makeBuildEntryMapper,
	makeDbQuery,
	makeFormatError,
	makeFormatResult,
	makeNotifyResourceChange,
	wrapToolHandler,
};
