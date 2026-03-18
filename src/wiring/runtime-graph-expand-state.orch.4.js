/** @implements FR-002 — Graph-expansion state, traversal, and scoring helpers. */
import { normalizeGraphTerm } from "./runtime-graph-expand-shared.orch.4.js";

export function collectUniqueSeedIds(seedIds) {
	const uniqueSeedIds = [];
	const seenSeed = {};
	for (let i = 0; i < seedIds.length; i++) {
		if (seenSeed[seedIds[i]] === true) {
			continue;
		}
		seenSeed[seedIds[i]] = true;
		uniqueSeedIds.push(seedIds[i]);
	}
	return { uniqueSeedIds, seenSeed };
}

export function indexSeedTopics(seedRows) {
	const seedTopicToIds = {};
	const seedTopicsLower = [];
	for (let i = 0; i < seedRows.length; i++) {
		const topicLower = normalizeGraphTerm(seedRows[i].topic);
		const rowId = seedRows[i].id;
		if (topicLower === null || typeof rowId !== "string") {
			continue;
		}
		if (!seedTopicToIds[topicLower]) {
			seedTopicToIds[topicLower] = [];
			seedTopicsLower.push(topicLower);
		}
		const topicSeedIds = seedTopicToIds[topicLower];
		let alreadyLinked = false;
		for (let j = 0; j < topicSeedIds.length; j++) {
			if (topicSeedIds[j] === rowId) {
				alreadyLinked = true;
				break;
			}
		}
		if (!alreadyLinked) {
			seedTopicToIds[topicLower] = [...topicSeedIds, rowId];
		}
	}
	return { seedTopicToIds, seedTopicsLower };
}

export function accumulateGraphConnections(triples, seedTopicToIds) {
	const seedConnections = {};
	const relatedTermConnections = {};
	for (let i = 0; i < triples.length; i++) {
		const subj = normalizeGraphTerm(triples[i].subject);
		const obj = normalizeGraphTerm(triples[i].object);
		if (subj !== null && seedTopicToIds[subj]) {
			const ids = seedTopicToIds[subj];
			for (let j = 0; j < ids.length; j++) {
				seedConnections[ids[j]] = (seedConnections[ids[j]] ?? 0) + 1;
			}
			if (obj !== null && !seedTopicToIds[obj]) {
				relatedTermConnections[obj] = (relatedTermConnections[obj] ?? 0) + 1;
			}
		}
		if (obj !== null && seedTopicToIds[obj]) {
			const ids = seedTopicToIds[obj];
			for (let j = 0; j < ids.length; j++) {
				seedConnections[ids[j]] = (seedConnections[ids[j]] ?? 0) + 1;
			}
			if (subj !== null && !seedTopicToIds[subj]) {
				relatedTermConnections[subj] = (relatedTermConnections[subj] ?? 0) + 1;
			}
		}
	}
	return { seedConnections, relatedTermConnections };
}

export function buildSeedSignalMap(seedConnections, std) {
	const outMap = {};
	const seedIds = std.Object.keys(seedConnections);
	for (let i = 0; i < seedIds.length; i++) {
		const id = seedIds[i];
		const count = seedConnections[id] ?? 0;
		if (count > 0) {
			outMap[id] = { id, score: std.Math.min(1, count / 3), hops: 0 };
		}
	}
	return outMap;
}

export function applyRelatedTermSignals(params) {
	for (let i = 0; i < params.relatedRows.length; i++) {
		const row = params.relatedRows[i];
		const rowId = row.id;
		if (params.seenSeed[rowId] === true) {
			continue;
		}
		const topicLower = normalizeGraphTerm(row.topic);
		if (typeof rowId !== "string" || topicLower === null) {
			continue;
		}
		const count = params.relatedTermConnections[topicLower] ?? 0;
		if (count <= 0) {
			continue;
		}
		const score =
			params.std.Math.min(1, 0.4 + (params.std.Math.min(count, 4) - 1) * 0.15);
		const existing = params.outMap[rowId];
		if (!existing || score > existing.score) {
			params.outMap[rowId] = { id: rowId, score, hops: 1 };
		}
	}
}

export function collectGraphSignals(outMap, std) {
	const ids = std.Object.keys(outMap);
	const out = [];
	for (let i = 0; i < ids.length; i++) {
		const scored = outMap[ids[i]];
		if (scored !== undefined) {
			out.push(scored);
		}
	}
	return out;
}
