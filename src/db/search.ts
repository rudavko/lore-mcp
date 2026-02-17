// GEMINI-CONTEXT: Hybrid retrieval (Spec 004). Combines lexical (FTS5 with LIKE
// fallback), optional semantic (Vectorize + Ai), and graph neighborhood scoring.
// Vectorize is feature-flagged — skipped when env bindings are absent.
// FTS5 is detected at schema init time via isFts5Available().

// GEMINI-CONTEXT: decodeCursor imported from shared lib/format.ts (DRY — was
// duplicated here and in mcp/resources.ts). Local definition removed below.
import type { Entry } from "../lib/types";
import { isFts5Available } from "./schema";
import { rowToEntry } from "./entries";
import { logEvent } from "../lib/observe";
import { decodeCursor, escapeLike } from "../lib/format";

interface ScoredResult {
	id: string;
	score_lexical: number;
	score_semantic: number;
	score_graph: number;
	score_total: number;
	graph_hops: number;
}

export interface HybridSearchParams {
	query: string;
	limit?: number;
	cursor?: string;
	weights?: { lexical?: number; semantic?: number; graph?: number };
}

export interface HybridSearchResult {
	items: (Entry & ScoredResult)[];
	next_cursor: string | null;
	retrieval_ms: number;
}

/**
 * Sanitize user input for FTS5 MATCH queries.
 * Wraps each token in double quotes to prevent FTS5 syntax errors from
 * special characters like -, *, AND, OR, NOT, NEAR, (, ).
 */
export function sanitizeFts5Query(raw: string): string {
	// Split on whitespace, filter empty, wrap each token in double quotes.
	// Double quotes inside tokens are escaped by doubling them.
	const tokens = raw.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return "";
	return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
}

/**
 * FTS5 full-text search using bm25() scoring.
 * Falls back to LIKE-based search if FTS5 is unavailable or query fails.
 */
export async function lexicalSearch(
	db: D1Database,
	query: string,
	limit: number,
): Promise<{ id: string; score_lexical: number }[]> {
	if (isFts5Available()) {
		const sanitized = sanitizeFts5Query(query);
		if (sanitized) {
			try {
				const { results } = await db.prepare(
					`SELECT e.id, bm25(entries_fts) AS rank
					 FROM entries_fts fts
					 JOIN entries e ON e.rowid = fts.rowid
					 WHERE entries_fts MATCH ?
					 AND e.deleted_at IS NULL
					 ORDER BY rank
					 LIMIT ?`,
				).bind(sanitized, limit * 2).all();

				// bm25() returns negative values where more-negative = better match.
				// Normalize to 0-1 range.
				if (results.length === 0) return [];
				const scores = results.map((r) => -(r.rank as number));
				const maxScore = Math.max(...scores, 0.001);
				return results.map((r, i) => ({
					id: r.id as string,
					score_lexical: scores[i] / maxScore,
				}));
			} catch (e) {
				logEvent("fts5_fallback", { error: String(e), query: sanitized });
			}
		}
	}

	// LIKE-based fallback — escapeLike prevents user-injected % _ wildcards
	const pattern = `%${escapeLike(query)}%`;
	const { results } = await db.prepare(
		`SELECT id, topic, content FROM entries
		 WHERE deleted_at IS NULL AND (topic LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')
		 ORDER BY created_at DESC
		 LIMIT ?`,
	).bind(pattern, pattern, pattern, limit * 2).all();

	const queryLower = query.toLowerCase();
	return results.map((r) => {
		const topic = (r.topic as string).toLowerCase();
		const content = (r.content as string).toLowerCase();
		let score = 0;
		if (topic === queryLower) score = 1.0;
		else if (topic.includes(queryLower)) score = 0.8;
		else if (content.includes(queryLower)) score = 0.5;
		else score = 0.3;
		return { id: r.id as string, score_lexical: score };
	});
}

/**
 * Semantic search via Cloudflare AI embeddings + Vectorize nearest-neighbor.
 * Returns empty array if either binding is absent.
 */
export async function semanticSearch(
	ai: Ai | undefined,
	vectorize: VectorizeIndex | undefined,
	query: string,
	limit: number,
): Promise<{ id: string; score_semantic: number }[]> {
	if (!ai || !vectorize) return [];

	try {
		// Generate query embedding
		const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", {
			text: [query],
		});

		const queryVector = (embeddingResult as { data?: number[][] }).data?.[0];
		if (!queryVector || queryVector.length === 0) return [];

		// Query Vectorize for nearest neighbors
		const matches = await vectorize.query(queryVector, { topK: limit });

		return matches.matches.map((m) => ({
			id: m.id,
			score_semantic: m.score,
		}));
	} catch {
		// AI or Vectorize call failed — graceful degradation
		return [];
	}
}

/**
 * Sync a single entry's embedding to Vectorize.
 * No-op if AI or Vectorize bindings are absent.
 */
export async function syncEmbedding(
	ai: Ai | undefined,
	vectorize: VectorizeIndex | undefined,
	entryId: string,
	text: string,
): Promise<void> {
	if (!ai || !vectorize) return;

	try {
		const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", {
			text: [text],
		});

		const vector = (embeddingResult as { data?: number[][] }).data?.[0];
		if (!vector || vector.length === 0) return;

		await vectorize.upsert([{ id: entryId, values: vector }]);
	} catch {
		// Embedding sync failure is non-fatal — log and continue
	}
}

/** Graph neighborhood expansion: find entries connected via triples. */
export async function graphExpand(
	db: D1Database,
	entryIds: string[],
	maxHops: number = 1,
): Promise<{ id: string; score_graph: number; graph_hops: number }[]> {
	if (entryIds.length === 0) return [];

	// Get topics of seed entries to find connected triples
	const placeholders = entryIds.map(() => "?").join(",");
	const { results: seedEntries } = await db.prepare(
		`SELECT id, topic FROM entries WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
	).bind(...entryIds).all();

	const seedTopics = seedEntries.map((r) => r.topic as string);
	if (seedTopics.length === 0) return [];

	// Find triples where seed topics appear as subject or object
	const topicPlaceholders = seedTopics.map(() => "?").join(",");
	const { results: relatedTriples } = await db.prepare(
		`SELECT subject, object FROM triples
		 WHERE (subject IN (${topicPlaceholders}) OR object IN (${topicPlaceholders}))
		 AND deleted_at IS NULL`,
	).bind(...seedTopics, ...seedTopics).all();

	// Collect related terms from the other side of each triple
	const relatedTerms = new Set<string>();
	for (const t of relatedTriples) {
		const subj = t.subject as string;
		const obj = t.object as string;
		if (seedTopics.includes(subj)) relatedTerms.add(obj);
		if (seedTopics.includes(obj)) relatedTerms.add(subj);
	}

	if (relatedTerms.size === 0) return [];

	// Find entries whose topic matches related terms
	const termArray = Array.from(relatedTerms);
	const termPlaceholders = termArray.map(() => "?").join(",");
	const { results: graphEntries } = await db.prepare(
		`SELECT id FROM entries
		 WHERE topic IN (${termPlaceholders}) AND deleted_at IS NULL
		 AND id NOT IN (${placeholders})`,
	).bind(...termArray, ...entryIds).all();

	return graphEntries.map((r) => ({
		id: r.id as string,
		score_graph: 1.0 / (1 + maxHops),  // Decay by hop distance
		graph_hops: 1,
	}));
}

/** Composite hybrid search combining lexical, semantic, and graph signals. */
export async function hybridSearch(
	db: D1Database,
	ai: Ai | undefined,
	vectorize: VectorizeIndex | undefined,
	params: HybridSearchParams,
): Promise<HybridSearchResult> {
	const start = Date.now();
	const limit = Math.min(params.limit ?? 20, 200);
	const weights = {
		lexical: params.weights?.lexical ?? 0.3,
		semantic: params.weights?.semantic ?? 0.5,
		graph: params.weights?.graph ?? 0.2,
	};

	// If no Vectorize, redistribute semantic weight to lexical + graph
	if (!ai || !vectorize) {
		weights.lexical += weights.semantic * 0.6;
		weights.graph += weights.semantic * 0.4;
		weights.semantic = 0;
	}

	// Run lexical and semantic in parallel
	const [lexResults, semResults] = await Promise.all([
		lexicalSearch(db, params.query, limit * 3),
		semanticSearch(ai, vectorize, params.query, limit * 3),
	]);

	// Build score map
	const scoreMap = new Map<string, ScoredResult>();

	for (const r of lexResults) {
		scoreMap.set(r.id, {
			id: r.id,
			score_lexical: r.score_lexical,
			score_semantic: 0,
			score_graph: 0,
			score_total: 0,
			graph_hops: 0,
		});
	}
	for (const r of semResults) {
		const existing = scoreMap.get(r.id);
		if (existing) {
			existing.score_semantic = r.score_semantic;
		} else {
			scoreMap.set(r.id, {
				id: r.id,
				score_lexical: 0,
				score_semantic: r.score_semantic,
				score_graph: 0,
				score_total: 0,
				graph_hops: 0,
			});
		}
	}

	// Graph expansion from top candidates
	const topIds = Array.from(scoreMap.keys()).slice(0, limit);
	const graphResults = await graphExpand(db, topIds, 1);

	for (const r of graphResults) {
		const existing = scoreMap.get(r.id);
		if (existing) {
			existing.score_graph = r.score_graph;
			existing.graph_hops = r.graph_hops;
		} else {
			scoreMap.set(r.id, {
				id: r.id,
				score_lexical: 0,
				score_semantic: 0,
				score_graph: r.score_graph,
				score_total: 0,
				graph_hops: r.graph_hops,
			});
		}
	}

	// Compute total scores
	for (const score of scoreMap.values()) {
		score.score_total =
			score.score_lexical * weights.lexical +
			score.score_semantic * weights.semantic +
			score.score_graph * weights.graph;
	}

	// Sort by score_total DESC, id ASC (deterministic tie-break)
	let sorted = Array.from(scoreMap.values()).sort((a, b) => {
		if (b.score_total !== a.score_total) return b.score_total - a.score_total;
		return a.id.localeCompare(b.id);
	});

	// Apply cursor (skip past cursor ID) — safe decode, ignore invalid cursors
	if (params.cursor) {
		const cursorId = decodeCursor(params.cursor);
		if (cursorId) {
			const idx = sorted.findIndex((s) => s.id === cursorId);
			if (idx >= 0) sorted = sorted.slice(idx + 1);
		}
	}

	const page = sorted.slice(0, limit);

	// Fetch full entry data for results
	if (page.length === 0) {
		return { items: [], next_cursor: null, retrieval_ms: Date.now() - start };
	}

	const idPlaceholders = page.map(() => "?").join(",");
	const { results: entryRows } = await db.prepare(
		`SELECT * FROM entries WHERE id IN (${idPlaceholders})`,
	).bind(...page.map((p) => p.id)).all();

	const entryMap = new Map<string, Entry>();
	for (const r of entryRows) {
		const entry = rowToEntry(r as Record<string, unknown>);
		entryMap.set(entry.id, entry);
	}

	const items = page
		.filter((p) => entryMap.has(p.id))
		.map((p) => ({
			...entryMap.get(p.id)!,
			...p,
		}));

	const nextCursor = page.length === limit && sorted.length > limit
		? btoa(page[page.length - 1].id)
		: null;

	return {
		items,
		next_cursor: nextCursor,
		retrieval_ms: Date.now() - start,
	};
}
