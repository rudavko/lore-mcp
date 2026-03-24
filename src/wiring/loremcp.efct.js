/** @implements FR-001, ADR-0001 — Lore MCP lifecycle orchestration for init and ingestion scheduling. */
/** Sentinel for TDD hook. */
import { createLoreMcpInstanceHost } from "./loremcp-host.orch.4.js";

export const _MODULE = "loremcp.efct";
const SUMMARY_FALLBACK = "Lore knowledge store — summary unavailable.";
function toNumber(value, std) {
	if (typeof value === "number") {
		return value;
	}
	if (typeof value === "string") {
		const parsed = std.Number(value);
		return std.Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}
function parseTagLists(rows, std) {
	const out = [];
	for (let i = 0; i < rows.length; i++) {
		const raw = rows[i].tags;
		if (typeof raw !== "string") {
			continue;
		}
		const parsed = std.json.parse(raw);
		if (!parsed.ok || !std.Array.isArray(parsed.value)) {
			continue;
		}
		const values = parsed.value;
		const tags = [];
		for (let j = 0; j < values.length; j++) {
			const tag = values[j];
			if (typeof tag === "string") {
				tags.push(tag);
			}
		}
		out.push(tags);
	}
	return out;
}
function mapSummaryData(raw, std) {
	const counts = raw[0]?.results || [];
	let entries = 0;
	let triples = 0;
	let entities = 0;
	for (let i = 0; i < counts.length; i++) {
		const key = counts[i].t;
		const value = toNumber(counts[i].c, std);
		if (key === "entries") {
			entries = value;
		}
		if (key === "triples") {
			triples = value;
		}
		if (key === "entities") {
			entities = value;
		}
	}
	const topicRows = raw[1]?.results || [];
	const topics = [];
	for (let i = 0; i < topicRows.length; i++) {
		const topic = topicRows[i].topic;
		if (typeof topic === "string") {
			topics.push(topic);
		}
	}
	const tripleRows = raw[2]?.results || [];
	const tripleSamples = [];
	for (let i = 0; i < tripleRows.length; i++) {
		if (
			typeof tripleRows[i].subject === "string" &&
			typeof tripleRows[i].predicate === "string" &&
			typeof tripleRows[i].object === "string"
		) {
			const subject = tripleRows[i].subject;
			const predicate = tripleRows[i].predicate;
			const object = tripleRows[i].object;
			tripleSamples.push({
				subject: subject,
				predicate: predicate,
				object: object,
			});
		}
	}
	const tagRows = raw[3]?.results || [];
	const tagLists = parseTagLists(tagRows, std);
	return { entries, triples, entities, topics, tripleSamples, tagLists };
}
export const makeInitLoreMcp = (deps) => {
	async function initLoreMcp(instance) {
		const host = createLoreMcpInstanceHost(instance);
		await deps.initSchema(host.db);
		let summary = SUMMARY_FALLBACK;
		try {
			summary = deps.formatSummary(
				mapSummaryData(await deps.querySummaryCounts(host.db), deps.std),
			);
		} catch {
			summary = SUMMARY_FALLBACK;
		}
		host.setServer(
			new deps.McpServerCtor({
			name: deps.serverName,
			version: deps.serverVersion,
			instructions: summary,
			}),
		);
		if (deps.configureServer !== undefined) {
			await deps.configureServer(host.getServer(), host.env);
		}
		try {
			await host.processIngestion();
		} catch {
			// Ingestion runs in background; startup should still succeed.
		}
	}
	return initLoreMcp;
};
export const makeProcessLoreIngestion = (deps) => {
	async function processLoreIngestion(instance) {
		const host = createLoreMcpInstanceHost(instance);
		const remaining = await deps.runIngestion(host.env, host.getServer());
		if (deps.shouldReschedule(remaining)) {
			await host.schedule(
				new deps.dateCtor(deps.nowMs() + deps.rescheduleDelayMs),
				"processIngestion",
			);
		}
	}
	return processLoreIngestion;
};
