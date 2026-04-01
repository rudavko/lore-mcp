/** @implements NFR-001 — Pure ingestion helpers: text chunking, async thresholds, topic extraction. */
export const SYNC_THRESHOLD_CHARS = 5000;
export const SYNC_THRESHOLD_ITEMS = 20;
export const CHUNK_SIZE = 500;
export const BATCH_SIZE = 10;
export const MAX_STORABLE_CONTENT = 900000;
/** Split text into chunks at paragraph boundaries (double newlines).
 *  Each chunk is trimmed and non-empty. */
export function chunkText(text) {
	const chunks = [];
	const paragraphs = [];
	let current = "";
	let prevNewline = false;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === "\n") {
			if (prevNewline) {
				let trimmed = trimString(current);
				if (trimmed.length > 0) {
					paragraphs.push(trimmed);
				}
				current = "";
				prevNewline = false;
			} else {
				prevNewline = true;
			}
		} else {
			if (prevNewline) {
				current += "\n";
				prevNewline = false;
			}
			current += text[i];
		}
	}
	let lastTrimmed = trimString(current);
	if (lastTrimmed.length > 0) {
		paragraphs.push(lastTrimmed);
	}
	let buffer = "";
	for (let i = 0; i < paragraphs.length; i++) {
		if (buffer.length + paragraphs[i].length > CHUNK_SIZE && buffer.length > 0) {
			chunks.push(trimString(buffer));
			buffer = "";
		}
		if (buffer.length > 0) {
			buffer += "\n\n";
		}
		buffer += paragraphs[i];
	}
	if (buffer.length > 0) {
		let trimmedBuffer = trimString(buffer);
		if (trimmedBuffer.length > 0) {
			chunks.push(trimmedBuffer);
		}
	}
	return chunks;
}
/** Check if content should be processed asynchronously based on size thresholds. */
export function shouldProcessAsync(content) {
	if (content.length > SYNC_THRESHOLD_CHARS) {
		return true;
	}
	const chunks = chunkText(content);
	return chunks.length > SYNC_THRESHOLD_ITEMS;
}
/** Extract a topic string from the first line of a chunk.
 *  Truncates to 100 chars, falls back to "ingested". */
export function extractChunkTopic(chunk) {
	const firstLine = getFirstLine(chunk);
	const normalized = normalizeWhitespace(trimString(firstLine));
	if (normalized.length === 0) {
		return "ingested";
	}
	const markerStripped = stripLeadingListMarker(normalized);
	const firstSentence = takeFirstSentence(markerStripped);
	const candidate = trimString(firstSentence);
	if (candidate.length === 0 || isLowSignalTopic(candidate)) {
		return "ingested";
	}
	return truncateTopic(candidate, 100);
}
/** Manual string trim (no .trim() to stay pure-safe). */
function trimString(s) {
	let start = 0;
	let end = s.length - 1;
	while (
		start <= end &&
		(s[start] === " " || s[start] === "\t" || s[start] === "\n" || s[start] === "\r")
	) {
		start++;
	}
	while (
		end >= start &&
		(s[end] === " " || s[end] === "\t" || s[end] === "\n" || s[end] === "\r")
	) {
		end--;
	}
	let result = "";
	for (let i = start; i <= end; i++) {
		result += s[i];
	}
	return result;
}
function getFirstLine(chunk) {
	let firstLine = "";
	for (let i = 0; i < chunk.length; i++) {
		if (chunk[i] === "\n") {
			break;
		}
		firstLine += chunk[i];
	}
	return firstLine;
}
function normalizeWhitespace(value) {
	let result = "";
	let inWhitespace = false;
	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
		const isWhitespace = ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
		if (isWhitespace) {
			if (!inWhitespace && result.length > 0) {
				result += " ";
			}
			inWhitespace = true;
			continue;
		}
		inWhitespace = false;
		result += ch;
	}
	return trimString(result);
}
function stripLeadingListMarker(value) {
	if (value.length >= 2 && (value[0] === "-" || value[0] === "*") && value[1] === " ") {
		return value.slice(2);
	}
	if (
		value.length >= 3 &&
		value[0] >= "0" &&
		value[0] <= "9" &&
		value[1] === "." &&
		value[2] === " "
	) {
		return value.slice(3);
	}
	return value;
}
function takeFirstSentence(value) {
	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
		if (ch !== "." && ch !== "!" && ch !== "?") {
			continue;
		}
		const hasNext = i + 1 < value.length;
		if (!hasNext || value[i + 1] === " ") {
			return value.slice(0, i);
		}
	}
	return value;
}
function isLowSignalTopic(value) {
	if (value.indexOf("http://") > -1 || value.indexOf("https://") > -1) {
		return true;
	}
	let words = 0;
	let inWord = false;
	let letterOrDigitCount = 0;
	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
		const isAlphaNum =
			(ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9");
		if (isAlphaNum) {
			letterOrDigitCount++;
		}
		if (ch === " ") {
			if (inWord) {
				words++;
				inWord = false;
			}
			continue;
		}
		inWord = true;
	}
	if (inWord) {
		words++;
	}
	if (words <= 1 && value.length >= 24) {
		return true;
	}
	if (letterOrDigitCount < 3) {
		return true;
	}
	return false;
}
function truncateTopic(value, maxLen) {
	if (value.length <= maxLen) {
		return value;
	}
	let cutAt = maxLen;
	for (let i = maxLen; i >= 40; i--) {
		if (value[i] === " ") {
			cutAt = i;
			break;
		}
	}
	return value.slice(0, cutAt);
}
