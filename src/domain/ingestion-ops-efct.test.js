/** @implements FR-017, FR-010, NFR-002 — Verify ingestion orchestration for sync, async, and batched processing flows. */
import { describe, expect, test } from "bun:test";
import {
	getIngestionStatus,
	ingestAsync,
	ingestSync,
	processIngestionBatch,
} from "./ingestion.ops.efct.js";

describe("domain/ingestion.ops.efct", () => {
	test("ingestSync records task progress, skips duplicates, and creates entries for new chunks", async () => {
		const createdEntries = [];
		const progressCalls = [];
		const statusCalls = [];
		const result = await ingestSync("content", undefined, {
			generateId: () => "task-1",
			chunkText: () => ["first chunk", "duplicate chunk", "third chunk"],
			insertTask: async () => {},
			isDuplicate: async (chunk) => chunk === "duplicate chunk",
			extractChunkTopic: (chunk) => `topic:${chunk}`,
			createEntry: async (entry) => {
				createdEntries.push(entry);
			},
			updateTaskProgress: async (taskId, count) => {
				progressCalls.push([taskId, count]);
			},
			updateTaskStatus: async (taskId, status) => {
				statusCalls.push([taskId, status]);
			},
		});

		expect(result).toEqual({
			task_id: "task-1",
			entries_created: 2,
			duplicates_skipped: 1,
		});
		expect(createdEntries).toEqual([
			{
				topic: "topic:first chunk",
				content: "first chunk",
				source: "ingestion:task-1",
				tags: ["ingested"],
			},
			{
				topic: "topic:third chunk",
				content: "third chunk",
				source: "ingestion:task-1",
				tags: ["ingested"],
			},
		]);
		expect(progressCalls).toEqual([
			["task-1", 1],
			["task-1", 2],
			["task-1", 3],
		]);
		expect(statusCalls).toEqual([["task-1", "completed"]]);
	});

	test("ingestAsync stores serialized input for later processing", async () => {
		const insertCalls = [];
		const result = await ingestAsync("content", "source-a", {
			generateId: () => "task-2",
			chunkText: () => ["first", "second"],
			serializeInputUri: (content, source) => `${source}:${content}`,
			insertTask: async (...args) => {
				insertCalls.push(args);
			},
		});

		expect(result).toEqual({ task_id: "task-2" });
		expect(insertCalls).toEqual([["task-2", "pending", 2, "source-a:content"]]);
	});

	test("processIngestionBatch returns zeros when no pending task exists", async () => {
		const result = await processIngestionBatch({
			findPendingTask: async () => null,
		});

		expect(result).toEqual({ processed: 0, remaining: 0 });
	});

	test("processIngestionBatch fails tasks with missing or invalid input data", async () => {
		const missingCalls = [];
		const missing = await processIngestionBatch({
			findPendingTask: async () => ({
				id: "task-missing",
				processed_items: 0,
				input_uri: null,
			}),
			updateTaskStatus: async (...args) => {
				missingCalls.push(args);
			},
		});
		const invalidCalls = [];
		const invalid = await processIngestionBatch({
			findPendingTask: async () => ({
				id: "task-invalid",
				processed_items: 0,
				input_uri: "bad-data",
			}),
			parseInputUri: () => null,
			updateTaskStatus: async (...args) => {
				invalidCalls.push(args);
			},
		});

		expect(missing).toEqual({ processed: 0, remaining: 0 });
		expect(missingCalls).toEqual([["task-missing", "failed", "No input data"]]);
		expect(invalid).toEqual({ processed: 0, remaining: 0 });
		expect(invalidCalls).toEqual([["task-invalid", "failed", "Invalid input data"]]);
	});

	test("processIngestionBatch processes one batch, skips duplicates, and returns remaining count", async () => {
		const progressCalls = [];
		const statusCalls = [];
		const createdEntries = [];
		const result = await processIngestionBatch({
			findPendingTask: async () => ({
				id: "task-batch",
				processed_items: 1,
				input_uri: "serialized",
			}),
			parseInputUri: () => ({
				content: "ignored",
				source: "source-a",
			}),
			chunkText: () => [
				"chunk-0",
				"chunk-1",
				"chunk-2",
				"chunk-3",
				"chunk-4",
				"chunk-5",
				"chunk-6",
				"chunk-7",
				"chunk-8",
				"chunk-9",
				"chunk-10",
				"chunk-11",
			],
			updateTaskStatus: async (...args) => {
				statusCalls.push(args);
			},
			isDuplicate: async (chunk) => chunk === "chunk-3",
			extractChunkTopic: (chunk) => `topic:${chunk}`,
			createEntry: async (entry) => {
				createdEntries.push(entry);
			},
			updateTaskProgress: async (...args) => {
				progressCalls.push(args);
			},
		});

		expect(result).toEqual({ processed: 10, remaining: 1 });
		expect(statusCalls).toEqual([["task-batch", "processing"]]);
		expect(progressCalls).toHaveLength(10);
		expect(progressCalls[0]).toEqual(["task-batch", 2]);
		expect(progressCalls[9]).toEqual(["task-batch", 11]);
		expect(createdEntries).toHaveLength(9);
		expect(createdEntries[0]).toEqual({
			topic: "topic:chunk-1",
			content: "chunk-1",
			source: "source-a",
			tags: ["ingested"],
		});
	});

	test("processIngestionBatch marks the task completed when no work remains", async () => {
		const statusCalls = [];
		const result = await processIngestionBatch({
			findPendingTask: async () => ({
				id: "task-done",
				processed_items: 0,
				input_uri: "serialized",
			}),
			parseInputUri: () => ({
				content: "ignored",
				source: undefined,
			}),
			chunkText: () => ["chunk-0", "chunk-1"],
			updateTaskStatus: async (...args) => {
				statusCalls.push(args);
			},
			isDuplicate: async () => false,
			extractChunkTopic: (chunk) => `topic:${chunk}`,
			createEntry: async () => {},
			updateTaskProgress: async () => {},
		});

		expect(result).toEqual({ processed: 2, remaining: 0 });
		expect(statusCalls).toEqual([
			["task-done", "processing"],
			["task-done", "completed"],
		]);
	});

	test("getIngestionStatus delegates to getTask", async () => {
		const result = await getIngestionStatus("task-3", {
			getTask: async (taskId) => ({ id: taskId, status: "completed" }),
		});

		expect(result).toEqual({ id: "task-3", status: "completed" });
	});
});
