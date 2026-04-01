/** @implements NFR-001 — Verify ingestion pure helpers: chunking, thresholds, topic extraction. */
import { describe, test, expect } from "bun:test";
import {
	SYNC_THRESHOLD_CHARS,
	SYNC_THRESHOLD_ITEMS,
	chunkText,
	shouldProcessAsync,
	extractChunkTopic,
} from "./ingestion.pure.js";
describe("domain/ingestion.pure", () => {
	describe("chunkText", () => {
		test("returns single chunk for short text", () => {
			const chunks = chunkText("Hello world");
			expect(chunks.length).toBe(1);
			expect(chunks[0]).toBe("Hello world");
		});
		test("splits on double newlines", () => {
			const text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
			const chunks = chunkText(text);
			expect(chunks.length).toBeGreaterThanOrEqual(1);
			for (let i = 0; i < chunks.length; i++) {
				expect(chunks[i].length).toBeGreaterThan(0);
			}
		});
		test("respects chunk size boundary", () => {
			let longParagraphs = "";
			for (let i = 0; i < 20; i++) {
				if (i > 0) longParagraphs += "\n\n";
				let para = "Paragraph " + i + ": ";
				for (let j = 0; j < 5; j++) {
					para += "This is filler text to make the paragraph longer. ";
				}
				longParagraphs += para;
			}
			const chunks = chunkText(longParagraphs);
			expect(chunks.length).toBeGreaterThan(1);
		});
		test("returns empty array for empty string", () => {
			expect(chunkText("").length).toBe(0);
		});
		test("trims whitespace from chunks", () => {
			const text = "  First  \n\n  Second  ";
			const chunks = chunkText(text);
			for (let i = 0; i < chunks.length; i++) {
				expect(chunks[i][0] !== " ").toBe(true);
			}
		});
	});
	describe("shouldProcessAsync", () => {
		test("returns false for short text", () => {
			expect(shouldProcessAsync("short")).toBe(false);
		});
		test("returns true for text exceeding char threshold", () => {
			let long = "";
			for (let i = 0; i < SYNC_THRESHOLD_CHARS + 100; i++) {
				long += "x";
			}
			expect(shouldProcessAsync(long)).toBe(true);
		});
		test("returns true for text with many chunks", () => {
			let manyParagraphs = "";
			for (let i = 0; i < SYNC_THRESHOLD_ITEMS + 5; i++) {
				if (i > 0) manyParagraphs += "\n\n";
				let para = "Paragraph " + i + ": ";
				for (let j = 0; j < 50; j++) {
					para += "filler text here. ";
				}
				manyParagraphs += para;
			}
			expect(shouldProcessAsync(manyParagraphs)).toBe(true);
		});
	});
	describe("extractChunkTopic", () => {
		test("uses first line as topic", () => {
			expect(extractChunkTopic("First line\nSecond line")).toBe("First line");
		});
		test("returns fallback for empty chunk", () => {
			expect(extractChunkTopic("")).toBe("ingested");
		});
		test("truncates long first lines", () => {
			let longLine = "";
			for (let i = 0; i < 200; i++) {
				longLine += "x";
			}
			const topic = extractChunkTopic(longLine);
			expect(topic.length).toBeLessThanOrEqual(100);
		});
		test("truncates long multi-word topics without falling back", () => {
			const topic = extractChunkTopic(
				"This release note headline is intentionally long so the extractor must keep the first meaningful sentence but cut it before it grows past the supported topic length for storage and display.",
			);
			expect(topic).toBe(
				"This release note headline is intentionally long so the extractor must keep the first meaningful",
			);
			expect(topic.length).toBeLessThanOrEqual(100);
		});
		test("trims whitespace", () => {
			expect(extractChunkTopic("  hello  \nworld")).toBe("hello");
		});
		test("uses first sentence over full first line", () => {
			const topic = extractChunkTopic(
				"Release notes are ready. Next line should not be used",
			);
			expect(topic).toBe("Release notes are ready");
		});
		test("normalizes internal whitespace", () => {
			const topic = extractChunkTopic("  hello   world\t\tfrom   lore  ");
			expect(topic).toBe("hello world from lore");
		});
		test("falls back for low-signal single-token inputs", () => {
			const topic = extractChunkTopic("a3f50c9f2be74e0ea5c0fbe1c6c8d8f2");
			expect(topic).toBe("ingested");
		});
	});
});
