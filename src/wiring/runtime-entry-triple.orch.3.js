/** @implements FR-001 — Combined entry/triple runtime operations surface. */
import { buildEntryOps } from "./runtime-entry-ops.orch.4.js";
import { buildTripleOps } from "./runtime-triple-ops.orch.4.js";

function buildEntryAndTripleOps(ctx) {
	const entryOps = buildEntryOps(ctx);
	const tripleOps = buildTripleOps(ctx);
	return {
		createEntry: entryOps.createEntry,
		updateEntry: entryOps.updateEntry,
		setEntryTypes: async (id, params) => {
			return await entryOps.updateEntry(id, params);
		},
		deleteEntry: entryOps.deleteEntry,
		queryEntries: entryOps.queryEntries,
		createTriple: tripleOps.createTriple,
		updateTriple: tripleOps.updateTriple,
		upsertTriple: tripleOps.upsertTriple,
		deleteTriple: tripleOps.deleteTriple,
		queryTriples: tripleOps.queryTriples,
		findActiveTriples: tripleOps.findActiveTriples,
	};
}

export { buildEntryAndTripleOps };
