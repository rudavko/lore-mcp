/** @implements FR-002, NFR-004 — Pure search query sanitization and score composition helpers. */
/** Sentinel for TDD hook. */
export const _MODULE = "search.pure";
/**
 * Sanitize user input for FTS5 MATCH queries.
 * Wraps each token in double quotes to prevent FTS5 syntax errors from
 * special characters like -, *, AND, OR, NOT, NEAR, (, ).
 */
export function sanitizeFts5Query(raw) {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return "";
	const tokens = [];
	let current = "";
	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i];
		if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
		} else {
			current += ch;
		}
	}
	if (current.length > 0) tokens.push(current);
	if (tokens.length === 0) return "";
	let result = "";
	for (let i = 0; i < tokens.length; i++) {
		if (i > 0) result += " ";
		result += '"';
		const token = tokens[i];
		for (let j = 0; j < token.length; j++) {
			if (token[j] === '"') {
				result += '""';
			} else {
				result += token[j];
			}
		}
		result += '"';
	}
	return result;
}
/** Compute weighted total score from individual signal scores. */
export function computeTotalScore(lexical, semantic, graph, weights) {
	return lexical * weights.lexical + semantic * weights.semantic + graph * weights.graph;
}
/** Redistribute semantic weight to lexical/graph when Vectorize is unavailable. */
export function redistributeWeights(weights, hasVectorize) {
	if (hasVectorize) {
		return { lexical: weights.lexical, semantic: weights.semantic, graph: weights.graph };
	}
	return {
		lexical: weights.lexical + weights.semantic * 0.6,
		semantic: 0,
		graph: weights.graph + weights.semantic * 0.4,
	};
}
/** Compute LIKE-based relevance score for fallback search. */
export function likeFallbackScore(topic, query, content) {
	const topicLower = topic.toLowerCase();
	const queryLower = query.toLowerCase();
	const contentLower = content.toLowerCase();
	if (topicLower === queryLower) return 1.0;
	if (topicLower.indexOf(queryLower) >= 0) return 0.8;
	if (contentLower.indexOf(queryLower) >= 0) return 0.5;
	return 0.3;
}
