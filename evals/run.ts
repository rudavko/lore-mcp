// GEMINI-CONTEXT: Retrieval quality eval runner (Spec 004-004).
// Seeds an in-memory DB with test entries, runs hybridSearch (FTS5 MATCH +
// graph, no Vectorize in CI), computes ndcg@10, mrr@10, recall@20.
// Compares to baseline thresholds and fails CI on regression.

import { createD1Mock } from "../src/test-utils";
import { initSchema } from "../src/db/schema";
import { createEntry } from "../src/db/entries";
import { createTriple } from "../src/db/triples";
import { hybridSearch } from "../src/db/search";
import { ndcgAtK, mrrAtK, recallAtK } from "./metrics";

// ---- Types ----

interface SeedEntry {
	ref: string;
	topic: string;
	content: string;
	tags: string[];
}

interface SeedTriple {
	subject: string;
	predicate: string;
	object: string;
}

interface EvalQuery {
	query: string;
	expected_refs: string[];
}

interface EvalResult {
	version: number;
	created_at: string;
	metrics: {
		ndcg_at_10: number;
		mrr_at_10: number;
		recall_at_20: number;
		latency_p95_ms: number;
	};
	per_query: Array<{
		query: string;
		ndcg: number;
		mrr: number;
		recall: number;
		latency_ms: number;
		result_count: number;
	}>;
}

// ---- Main ----

async function main() {
	const datasetPath = new URL("./datasets/retrieval.json", import.meta.url).pathname;
	const baselinePath = new URL("./baselines/retrieval.json", import.meta.url).pathname;
	const outputPath = new URL("./artifacts/retrieval.json", import.meta.url).pathname;

	const dataset = JSON.parse(await Bun.file(datasetPath).text());
	const baseline = JSON.parse(await Bun.file(baselinePath).text());

	const seedEntries: SeedEntry[] = dataset.seed_entries;
	const seedTriples: SeedTriple[] = dataset.triples ?? [];
	const queries: EvalQuery[] = dataset.queries;

	// Set up in-memory DB and seed entries + triples
	const db = createD1Mock();
	await initSchema(db);

	const refToId = new Map<string, string>();
	for (const seed of seedEntries) {
		const entry = await createEntry(db, {
			topic: seed.topic,
			content: seed.content,
			tags: seed.tags,
		});
		refToId.set(seed.ref, entry.id);
	}

	for (const triple of seedTriples) {
		await createTriple(db, triple);
	}

	console.log(`Seeded ${seedEntries.length} entries + ${seedTriples.length} triples, running ${queries.length} queries...`);

	const perQuery: EvalResult["per_query"] = [];
	const latencies: number[] = [];

	for (const q of queries) {
		// Resolve expected refs to actual IDs
		const expectedIds = new Set<string>();
		for (const ref of q.expected_refs) {
			const id = refToId.get(ref);
			if (id) expectedIds.add(id);
		}

		const start = performance.now();

		// Run hybrid search (no AI/Vectorize in CI — lexical + graph only)
		const result = await hybridSearch(db, undefined, undefined, {
			query: q.query,
			limit: 20,
		});

		const elapsed = performance.now() - start;
		latencies.push(elapsed);

		const rankedIds = result.items.map((item) => item.id);

		perQuery.push({
			query: q.query,
			ndcg: ndcgAtK(rankedIds, expectedIds, 10),
			mrr: mrrAtK(rankedIds, expectedIds, 10),
			recall: recallAtK(rankedIds, expectedIds, 20),
			latency_ms: elapsed,
			result_count: rankedIds.length,
		});
	}

	latencies.sort((a, b) => a - b);
	const p95Index = Math.floor(latencies.length * 0.95);
	const latencyP95 = latencies[p95Index] ?? 0;

	const avgNdcg = perQuery.reduce((s, q) => s + q.ndcg, 0) / (perQuery.length || 1);
	const avgMrr = perQuery.reduce((s, q) => s + q.mrr, 0) / (perQuery.length || 1);
	const avgRecall = perQuery.reduce((s, q) => s + q.recall, 0) / (perQuery.length || 1);

	const evalResult: EvalResult = {
		version: 3,
		created_at: new Date().toISOString(),
		metrics: {
			ndcg_at_10: avgNdcg,
			mrr_at_10: avgMrr,
			recall_at_20: avgRecall,
			latency_p95_ms: latencyP95,
		},
		per_query: perQuery,
	};

	await Bun.write(outputPath, JSON.stringify(evalResult, null, 2));
	console.log(`Results written to ${outputPath}`);
	console.log(`Metrics: ndcg@10=${avgNdcg.toFixed(4)}, mrr@10=${avgMrr.toFixed(4)}, recall@20=${avgRecall.toFixed(4)}, p95=${latencyP95.toFixed(1)}ms`);

	// Per-query breakdown
	for (const pq of perQuery) {
		const status = pq.result_count > 0 ? "OK" : "MISS";
		console.log(`  [${status}] "${pq.query}" → ${pq.result_count} results, ndcg=${pq.ndcg.toFixed(3)}, mrr=${pq.mrr.toFixed(3)}, recall=${pq.recall.toFixed(3)}`);
	}

	// Compare to baseline thresholds
	const thresholds = {
		ndcg_at_10: -0.02,   // max 2% regression
		mrr_at_10: -0.02,
		recall_at_20: -0.01, // max 1% regression
		latency_p95_ms: 0.10, // max 10% increase (as ratio)
	};

	let failed = false;
	for (const [metric, threshold] of Object.entries(thresholds)) {
		const current = evalResult.metrics[metric as keyof typeof evalResult.metrics];
		const base = baseline.metrics[metric as keyof typeof baseline.metrics] ?? 0;

		if (metric === "latency_p95_ms") {
			if (base > 0 && current > base * (1 + threshold)) {
				console.error(`REGRESSION: ${metric} increased from ${base}ms to ${current}ms (>${threshold * 100}%)`);
				failed = true;
			}
		} else {
			if (base > 0 && current - base < threshold) {
				console.error(`REGRESSION: ${metric} dropped from ${base} to ${current} (threshold: ${threshold})`);
				failed = true;
			}
		}
	}

	if (failed) {
		process.exit(1);
	}

	console.log("All metrics within thresholds.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
