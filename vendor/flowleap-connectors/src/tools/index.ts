/*---------------------------------------------------------------------------------------------
 *  The tools of the package (ADR 0019 C2a): the contract, the office tool
 *  definitions, and the pieces a host's own tools build on.
 *--------------------------------------------------------------------------------------------*/

export type {
	ToolDefinition,
	ToolContext,
	ToolCaller,
	ToolAccess,
	ToolAnnotations,
	JsonSchema,
} from './definition.js';
export { toolInputJsonSchema } from './definition.js';
export { officeTools, patentNumberInput, usApplicationNumberInput } from './office-tools.js';
export { ocrTool } from './ocr-tool.js';
export {
	ToolError,
	tool,
	titleFromToolName,
	flexibleId,
	unwrapRead,
	unwrapOdp,
	unwrapCachedOdp,
	cachedOdpRead,
	ODP_SEARCH_TTL,
	ODP_LOOKUP_TTL,
	ODP_DOCUMENT_TEXT_TTL,
	type OdpResult,
} from './shared.js';
export {
	patentDocumentReference,
	withDocumentReference,
	withCitationDocumentReference,
	type DocumentReference,
} from './document-reference.js';
export { evidenceAnchor, evidenceAnchorLabel, evidenceSource, type EvidenceSource, withEvidenceAnchor } from './evidence-anchor.js';
export { detectPatentProvider, normalizePatentNumber, type DetectedPatentProvider } from './provider.js';
export {
	withExtendedFamilyCoverage,
	attachCoverage,
	attachRepresentatives,
	type MissingPublication,
	type ExtendedFamilyCoverage,
	type EquivalentsFamilyWithCoverage,
} from './family-coverage.js';
export {
	searchPatentsInput,
	searchPatentsHandler,
	SEARCH_PATENTS_DESCRIPTION,
	type SearchPatentsInput,
} from './search-parity.js';
