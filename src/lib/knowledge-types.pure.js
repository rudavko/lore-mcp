/** @implements FR-003, NFR-001 — Pure knowledge-type classification and promotion guard helpers. */
export function knowledgeTypes() {
	return [
		"observation",
		"evidence",
		"assumption",
		"hypothesis",
		"fact",
		"decision",
		"question",
		"pattern",
		"lesson",
	];
}
export function memoryTypes() {
	return ["fleeting", "factual", "core"];
}
export function promotionPredicates() {
	return ["supported_by", "grounded_by", "derived_from"];
}
function supportedBySubjectTypes() {
	return ["hypothesis", "fact", "assumption", "decision", "pattern", "lesson"];
}
function supportedByObjectTypes() {
	return ["evidence", "observation", "fact", "pattern", "lesson"];
}
function groundedBySubjectTypes() {
	return ["assumption", "hypothesis", "fact", "decision", "pattern", "lesson"];
}
function groundedByObjectTypes() {
	return ["observation", "evidence", "fact", "pattern"];
}
function derivedFromSubjectTypes() {
	return ["hypothesis", "fact", "decision", "pattern", "lesson"];
}
function derivedFromObjectTypes() {
	return ["observation", "evidence", "assumption", "hypothesis", "fact", "pattern", "lesson"];
}
export function isKnowledgeType(value) {
	const knownTypes = knowledgeTypes();
	for (let i = 0; i < knownTypes.length; i++) {
		if (knownTypes[i] === value) {
			return true;
		}
	}
	return false;
}
export function isMemoryType(value) {
	const retainedTypes = memoryTypes();
	for (let i = 0; i < retainedTypes.length; i++) {
		if (retainedTypes[i] === value) {
			return true;
		}
	}
	return false;
}
export function isPromotionPredicate(value) {
	const predicates = promotionPredicates();
	for (let i = 0; i < predicates.length; i++) {
		if (predicates[i] === value) {
			return true;
		}
	}
	return false;
}
function contains(list, value) {
	for (let i = 0; i < list.length; i++) {
		if (list[i] === value) {
			return true;
		}
	}
	return false;
}
export function isCompatiblePromotionEdge(predicate, subjectType, objectType) {
	if (predicate === "supported_by") {
		return (
			contains(supportedBySubjectTypes(), subjectType) &&
			contains(supportedByObjectTypes(), objectType)
		);
	}
	if (predicate === "grounded_by") {
		return (
			contains(groundedBySubjectTypes(), subjectType) &&
			contains(groundedByObjectTypes(), objectType)
		);
	}
	return (
		contains(derivedFromSubjectTypes(), subjectType) &&
		contains(derivedFromObjectTypes(), objectType)
	);
}
export function memoryTypeWeight(memoryType) {
	if (memoryType === "core") {
		return 1.25;
	}
	if (memoryType === "factual") {
		return 1.1;
	}
	return 0.9;
}
