/** @implements FR-003 — LIKE-query fallback helpers for runtime search orchestration. */
function escapeLike(value) {
	let out = "";
	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
		if (ch === "\\") {
			out += "\\\\";
		} else if (ch === "%") {
			out += "\\%";
		} else if (ch === "_") {
			out += "\\_";
		} else {
			out += ch;
		}
	}
	return out;
}

function buildLikeQuery(tokens, _std) {
	const clauses = [];
	const binds = [];
	for (let i = 0; i < tokens.length; i++) {
		clauses.push(
			"(topic LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')",
		);
		const pattern = "%" + escapeLike(tokens[i]) + "%";
		binds.push(pattern, pattern, pattern);
	}
	return { whereClause: clauses.join(" OR "), binds };
}

async function runLikeTokenFallback(params) {
	const split = params.query.trim().split(/\s+/);
	const tokens = [];
	for (let i = 0; i < split.length; i++) {
		if (split[i].length > 0) {
			tokens.push(split[i]);
		}
	}
	if (tokens.length === 0) {
		return [];
	}
	const whereClause =
		"(topic LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')";
	const matchCounts = {};
	for (let i = 0; i < tokens.length; i++) {
		const pattern = "%" + escapeLike(tokens[i]) + "%";
		const rows = await params.likeSearchRows(
			params.db,
			whereClause,
			[pattern, pattern, pattern],
			params.limit * 2,
		);
		for (let j = 0; j < rows.length; j++) {
			const id = rows[j].id;
			if (typeof id === "string") {
				matchCounts[id] = (matchCounts[id] ?? 0) + 1;
			}
		}
	}
	const ids = params.std.Object.keys(matchCounts);
	const out = [];
	for (let i = 0; i < ids.length; i++) {
		out.push({ id: ids[i], score: matchCounts[ids[i]] / tokens.length });
	}
	out.sort((a, b) => b.score - a.score);
	return out.length > params.limit * 2 ? out.slice(0, params.limit * 2) : out;
}

export { buildLikeQuery, runLikeTokenFallback };
