// IR metric functions used by eval runner and tested independently.

export function ndcgAtK(ranked: string[], relevant: Set<string>, k: number): number {
	let dcg = 0;
	for (let i = 0; i < Math.min(ranked.length, k); i++) {
		if (relevant.has(ranked[i])) {
			dcg += 1 / Math.log2(i + 2);
		}
	}
	let idcg = 0;
	const idealK = Math.min(relevant.size, k);
	for (let i = 0; i < idealK; i++) {
		idcg += 1 / Math.log2(i + 2);
	}
	return idcg === 0 ? 0 : dcg / idcg;
}

export function mrrAtK(ranked: string[], relevant: Set<string>, k: number): number {
	for (let i = 0; i < Math.min(ranked.length, k); i++) {
		if (relevant.has(ranked[i])) {
			return 1 / (i + 1);
		}
	}
	return 0;
}

export function recallAtK(ranked: string[], relevant: Set<string>, k: number): number {
	if (relevant.size === 0) return 0;
	let found = 0;
	for (let i = 0; i < Math.min(ranked.length, k); i++) {
		if (relevant.has(ranked[i])) found++;
	}
	return found / relevant.size;
}
