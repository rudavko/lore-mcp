/** @implements FR-001, NFR-001 — Pure summary formatting for knowledge store overview output. */
export function summaryValueToNumber(value) {
	if (typeof value === "number") {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

export function parseSummaryTagLists(rows, parseJson) {
	const out = [];
	for (let i = 0; i < rows.length; i++) {
		const raw = rows[i].tags;
		if (typeof raw !== "string") {
			continue;
		}
		const parsed = parseJson(raw);
		if (!parsed.ok || !Array.isArray(parsed.value)) {
			continue;
		}
		const tags = [];
		for (let j = 0; j < parsed.value.length; j++) {
			if (typeof parsed.value[j] === "string") {
				tags.push(parsed.value[j]);
			}
		}
		out.push(tags);
	}
	return out;
}

export function mapSummaryData(raw, parseJson) {
	const counts = raw[0]?.results || [];
	let entries = 0;
	let triples = 0;
	let entities = 0;
	for (let i = 0; i < counts.length; i++) {
		const key = counts[i].t;
		const value = summaryValueToNumber(counts[i].c);
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
			tripleSamples.push({
				subject: tripleRows[i].subject,
				predicate: tripleRows[i].predicate,
				object: tripleRows[i].object,
			});
		}
	}
	return {
		entries,
		triples,
		entities,
		topics,
		tripleSamples,
		tagLists: parseSummaryTagLists(raw[3]?.results || [], parseJson),
	};
}

export function formatSummary(data) {
	const total = data.entries + data.triples + data.entities;
	if (total === 0) {
		return "Lore knowledge store — empty. Use object_create, link_object, and retrieve to build knowledge.";
	}
	const lines = [
		`Lore knowledge store — ${data.entries} entries, ${data.triples} triples, ${data.entities} entities.`,
	];
	if (data.topics.length > 0) {
		lines.push(`Recent topics: ${data.topics.join(", ")}`);
	}
	const tagCounts = countTags(data.tagLists);
	if (tagCounts.length > 0) {
		const top = tagCounts
			.slice(0, 10)
			.map(([tag, count]) => `${tag} (${count})`)
			.join(", ");
		lines.push(`Top tags: ${top}`);
	}
	if (data.tripleSamples.length > 0) {
		const formatted = data.tripleSamples
			.map((r) => `${r.subject} --${r.predicate}--> ${r.object}`)
			.join(", ");
		lines.push(`Recent graph: ${formatted}`);
	}
	return lines.join("\n");
}
function countTags(tagLists) {
	const seen = [];
	const counts = [];
	for (const tags of tagLists) {
		for (const tag of tags) {
			const idx = seen.indexOf(tag);
			if (idx === -1) {
				seen.push(tag);
				counts.push(1);
			} else {
				counts[idx] += 1;
			}
		}
	}
	const result = [];
	for (let i = 0; i < seen.length; i++) {
		result.push([seen[i], counts[i]]);
	}
	result.sort((a, b) => b[1] - a[1]);
	return result;
}
