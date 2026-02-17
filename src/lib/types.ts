// Shared interfaces for the knowledge server.

export interface Entry {
	id: string;
	topic: string;
	content: string;
	tags: string[];
	source: string | null;
	actor: string | null;
	confidence: number | null;
	valid_from: string | null;
	valid_to: string | null;
	status: string;
	canonical_entity_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface Triple {
	id: string;
	subject: string;
	predicate: string;
	object: string;
	source: string | null;
	actor: string | null;
	confidence: number | null;
	valid_from: string | null;
	valid_to: string | null;
	status: string;
	created_at: string;
}

export interface Transaction {
	id: string;
	op: string;
	entity_type: string;
	entity_id: string;
	before_snapshot: string | null;
	after_snapshot: string | null;
	reverted_by: string | null;
	created_at: string;
}

export interface CanonicalEntity {
	id: string;
	name: string;
	created_at: string;
}

export interface EntityAlias {
	id: string;
	alias: string;
	canonical_entity_id: string;
	created_at: string;
}

export interface IngestionTask {
	id: string;
	status: string;
	input_uri: string | null;
	total_items: number;
	processed_items: number;
	error: string | null;
	created_at: string;
	updated_at: string;
}

export interface ConflictInfo {
	conflict_id: string;
	scope: string;
	existing: Triple;
	incoming: {
		subject: string;
		predicate: string;
		object: string;
		confidence?: number | null;
		source?: string | null;
		actor?: string | null;
	};
	candidate_resolutions: string[];
}
