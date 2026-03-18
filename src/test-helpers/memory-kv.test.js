/** @implements NFR-001 — Shared in-memory KV fixtures for test flows. */
function normalizeExpirationOptions(rawOptions) {
	if (typeof rawOptions === "number" && rawOptions > 0) {
		return { expirationTtl: rawOptions };
	}
	return rawOptions || null;
}

export function createExpiringMemoryKv(options = {}) {
	const values = new Map();
	const putImpl = options.putImpl;
	const getImpl = options.getImpl;
	const deleteImpl = options.deleteImpl;
	const listImpl = options.listImpl;
	const sweepExpired = () => {
		const now = Date.now();
		for (const [key, entry] of values.entries()) {
			if (entry.expiresAtMs !== null && entry.expiresAtMs <= now) {
				values.delete(key);
			}
		}
	};
	return {
		get: async (key, rawOptions) => {
			sweepExpired();
			if (typeof getImpl === "function") {
				return await getImpl(key, rawOptions, values);
			}
			if (!values.has(key)) {
				return null;
			}
			const raw = values.get(key).value;
			if (rawOptions?.type === "json") {
				try {
					return JSON.parse(raw);
				} catch {
					return null;
				}
			}
			return raw;
		},
		put: async (key, value, rawOptions) => {
			sweepExpired();
			if (typeof putImpl === "function") {
				return await putImpl(key, value, rawOptions, values);
			}
			const options = normalizeExpirationOptions(rawOptions);
			let expiresAtMs = null;
			if (typeof options?.expirationTtl === "number" && options.expirationTtl > 0) {
				expiresAtMs = Date.now() + options.expirationTtl * 1000;
			} else if (typeof options?.expiration === "number" && options.expiration > 0) {
				expiresAtMs = options.expiration * 1000;
			}
			values.set(key, { value, expiresAtMs });
		},
		delete: async (key) => {
			if (typeof deleteImpl === "function") {
				return await deleteImpl(key, values);
			}
			values.delete(key);
		},
		list: async (rawOptions) => {
			sweepExpired();
			if (typeof listImpl === "function") {
				return await listImpl(rawOptions, values);
			}
			const keys = [];
			for (const key of values.keys()) {
				if (!rawOptions?.prefix || key.startsWith(rawOptions.prefix)) {
					keys.push({ name: key });
				}
			}
			return { keys, list_complete: true, cursor: "" };
		},
		values,
	};
}

export function createMemoryKv(options = {}) {
	return createExpiringMemoryKv(options);
}
