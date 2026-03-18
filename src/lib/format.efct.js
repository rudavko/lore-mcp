/** @implements NFR-001 — Effects boundary for resource formatting helpers. */
export function jsonResource(uri, data, std) {
	const text = std.json.stringify(data);
	return {
		content: [
			{
				type: "resource",
				resource: {
					uri,
					mimeType: "application/json",
					text: text.ok ? text.value : "{}",
				},
			},
		],
	};
}
