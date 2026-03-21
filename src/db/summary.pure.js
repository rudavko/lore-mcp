/** @implements FR-001, NFR-001 — Pure summary formatting for knowledge store overview output. */
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
