// Response formatting for MCP tools (Spec 002).
// Every tool returns text + optional embedded resource for structured consumption.

import { KnowledgeError } from "./errors";

interface TextContent {
	type: "text";
	text: string;
}

interface ResourceContent {
	type: "resource";
	resource: {
		uri: string;
		mimeType: string;
		text: string;
	};
}

type ContentBlock = TextContent | ResourceContent;

export interface ToolResult {
	[key: string]: unknown;
	content: ContentBlock[];
	isError?: boolean;
}

export function formatResult(
	text: string,
	data?: unknown,
	uri?: string,
): ToolResult {
	const content: ContentBlock[] = [{ type: "text", text }];
	if (data !== undefined && uri) {
		content.push({
			type: "resource",
			resource: {
				uri,
				mimeType: "application/json",
				text: JSON.stringify(data),
			},
		});
	}
	return { content };
}

/** Decode a base64 cursor string. Returns null for missing, empty, or invalid cursors. */
export function decodeCursor(raw: string | undefined): string | null {
	if (!raw) return null;
	try {
		const decoded = atob(raw);
		return decoded || null;
	} catch {
		return null;
	}
}

/** Escape SQL LIKE wildcards so user input is matched literally. */
export function escapeLike(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function formatError(err: unknown): ToolResult {
	if (err instanceof KnowledgeError) {
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						error: err.code,
						message: err.message,
						retryable: err.retryable,
					}),
				},
			],
			isError: true,
		};
	}
	const message = err instanceof Error ? err.message : String(err);
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify({
					error: "internal",
					message,
					retryable: false,
				}),
			},
		],
		isError: true,
	};
}
