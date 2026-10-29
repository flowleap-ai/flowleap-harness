/**
 * The observe-only recorder: every `tools/result` of a data tool becomes one
 * {@link PatentExecution} in the Session's ledger, so the writer can check a
 * report's anchors, quotes, figures and dates against what the tools returned.
 *
 * Two modes, decided per result:
 *
 * - **structured**: the result carries `sources` (the connector library's
 *   evidence field, flowleap-backend #611): each entry maps straight into the
 *   ledger after the untrusted-record check.
 * - **derived**: no `sources` field (the vendored library before #611, the paid
 *   MCP tools): the recorder derives the sources from the result's own
 *   `documentReference` fields and claim list with the IDE's anchor function, so
 *   anchors are byte-identical to the IDE's, and captures the full result text
 *   keyed by tool and arguments. In this mode a `tools/post-execute` projection
 *   appends the IDE's `[source anchor: …]` labels to the model-facing content of
 *   the three text tools, so the model can cite what it reads.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { parsePatentDocumentReference, type PatentDocumentReference } from '../report/document-reference.ts'
import type { NewPatentExecution, PatentLedger } from './store.ts'
import {
  evidenceAnchor, HARNESS_STATUS_TOOLS, readEvidenceSource,
  type PatentEvidenceSource, type PatentRecordedTool,
} from './types.ts'

/** Which mode produced a record. */
export type RecorderMode = 'structured' | 'derived'

/** The evidence-carrying text tools whose results get anchor labels in derived mode. */
const TEXT_TOOLS: ReadonlySet<string> = new Set(['get_claims', 'get_description', 'get_abstract', 'get_bibliography'])

/** Retrieval tools recorded as `details`: the text reads of one publication. */
const DETAILS_TOOLS: ReadonlySet<string> = new Set([...TEXT_TOOLS, 'get_fulltext'])

/**
 * Status tools, recorded with their full result text so a memo's dates and figures can be traced:
 * the IDE's four and the harness's native status, bibliographic, file-wrapper and term reads
 * (`HARNESS_STATUS_TOOLS`). An FTO memo reads a lapse date off `get_patent_summary`, a grant date
 * off `get_family` and the PTA days off `get_patent_term_adjustment`; a result outside this set is
 * outside the audit, and the memo then tells the attorney a grounded date is unsupported.
 */
const STATUS_TOOLS: ReadonlySet<string> = new Set(['get_legal_status', 'get_patent_family', 'get_patent_term', 'get_register_events', ...HARNESS_STATUS_TOOLS])

/** The result text of these details reads is kept whole: a bibliography is dates and names, not a passage, so no source holds them. */
const TEXT_KEPT_DETAILS: ReadonlySet<string> = new Set(['get_bibliography'])

/** The MCP server the paid tools arrive from; its prefix is stripped before the name is matched. */
const MCP_PREFIX = /^mcp__[^_]+(?:_[^_]+)*__/u

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/**
 * The text of a result's blocks, joined.
 * @param content - the model-facing blocks.
 * @returns the concatenated text.
 */
export function contentText(content: readonly ContentBlock[]): string {
  return content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

/**
 * The tool identity a harness name maps to in the ledger: the MCP prefix dropped,
 * the shell and web names folded onto the IDE's.
 * @param name - the registered tool name.
 * @returns the bare name the adapters match.
 */
export function bareToolName(name: string): string {
  return name.replace(MCP_PREFIX, '')
}

/** The analytics identity of a bare tool name, or `undefined` when the tool is not recorded as analytics. */
function analyticsTool(name: string): PatentRecordedTool | undefined {
  if (name === 'patstat_query' || name === 'patstat_portfolio' || name === 'examiner_baseline' || name === 'read_pdf') return name
  if (name.startsWith('patstat_')) return 'patstat_graph'
  if (name === 'patent_analytics') return 'patent_analytics_viz'
  if (name === 'web_fetch') return 'fetch_webpage'
  if (name === 'bash' || name === 'pwsh') return 'run_in_terminal'
  return undefined
}

/** The request a record keeps for an analytics tool: the argument that identifies the call. */
function analyticsRequest(args: JsonRecord): string {
  return text(args['sql']) ?? text(args['query']) ?? text(args['url']) ?? text(args['path']) ?? text(args['command']) ?? text(args['publication']) ?? JSON.stringify(args)
}

/**
 * Sources the connector library returned itself (structured mode): each entry
 * is normalized to the ledger's record shape and accepted only when its anchor
 * is the one its reference implies.
 * @param value - the result value.
 * @returns the sources, or `undefined` when the result carries no `sources` field.
 */
export function structuredSources(value: unknown): PatentEvidenceSource[] | undefined {
  if (!isRecord(value) || !Array.isArray(value['sources'])) return undefined
  const sources: PatentEvidenceSource[] = []
  for (const entry of value['sources'] as unknown[]) {
    if (!isRecord(entry)) continue
    const source = readEvidenceSource({
      anchor: entry['anchor'],
      reference: entry['reference'],
      ...entry['language'] === undefined ? {} : { language: entry['language'] },
      ...entry['text'] === undefined ? {} : { text: entry['text'] },
      retrieval: entry['retrieval'] === 'unsegmented' ? 'unsegmented' : 'returned',
      review: 'unknown',
      completeness: 'unknown',
    })
    if (source !== undefined) sources.push(source)
  }
  return sources
}

function source(reference: PatentDocumentReference, textValue: string | undefined, language: string | undefined, retrieval: 'returned' | 'unsegmented' = 'returned'): PatentEvidenceSource {
  return {
    anchor: evidenceAnchor(reference, language),
    reference,
    ...language === undefined ? {} : { language },
    ...textValue === undefined ? {} : { text: textValue },
    retrieval,
    review: 'unknown',
    completeness: 'unknown',
  }
}

/**
 * Sources derived from a text tool's own result shape (derived mode): the
 * connector results already carry `documentReference` per document and per
 * claim, so the anchors equal the IDE's.
 * @param name - the bare tool name.
 * @param value - the result value.
 * @returns the derived sources, possibly empty.
 */
export function derivedSources(name: string, value: unknown): PatentEvidenceSource[] {
  if (!isRecord(value)) return []
  const reference = parsePatentDocumentReference(value['documentReference'])
  if (reference === undefined) return []
  const language = text(value['language']) ?? text(value['lang'])
  switch (name) {
    case 'get_claims': {
      const sources: PatentEvidenceSource[] = []
      const claims = Array.isArray(value['claims']) ? (value['claims'] as unknown[]) : []
      const texts: string[] = []
      for (const claim of claims) {
        if (!isRecord(claim)) continue
        const claimReference = parsePatentDocumentReference(claim['documentReference'])
        const claimText = text(claim['text'])
        if (claimReference === undefined || claimText === undefined) continue
        texts.push(claimText)
        sources.push(source(claimReference, claimText, language))
      }
      const unsegmented = text(value['unsegmentedText'])
      if (unsegmented !== undefined) sources.push(source({ publicationNumber: reference.publicationNumber, section: 'claims' }, unsegmented, language, 'unsegmented'))
      else if (texts.length > 0) sources.push(source({ publicationNumber: reference.publicationNumber, section: 'claims' }, texts.join('\n\n'), language))
      return sources
    }
    case 'get_description': {
      const description = text(value['description'])
      return description === undefined ? [] : [source({ publicationNumber: reference.publicationNumber, section: 'description' }, description, language)]
    }
    case 'get_abstract': {
      const abstract = text(value['abstract'])
      return abstract === undefined ? [] : [source({ publicationNumber: reference.publicationNumber, section: 'abstract' }, abstract, language)]
    }
    case 'get_bibliography':
      return [source({ publicationNumber: reference.publicationNumber, section: 'bibliography' }, text(value['abstract']), language)]
    default:
      return []
  }
}

/** The sections a details read asked for but did not get. */
function unavailableSections(name: string, value: unknown): string[] | undefined {
  if (!isRecord(value)) return undefined
  if (name === 'get_description' && text(value['description']) === undefined) return ['description']
  if (name === 'get_abstract' && text(value['abstract']) === undefined) return ['abstract']
  if (name === 'get_claims' && !(Array.isArray(value['claims']) && value['claims'].length > 0) && text(value['unsegmentedText']) === undefined) return ['claims']
  return undefined
}

/**
 * How many rows a status read returned: legal-status events, family members, file-wrapper records
 * (`count`), listed documents, or citations; `undefined` when the result counts nothing.
 */
function statusRowCount(value: JsonRecord): number | undefined {
  for (const key of ['events', 'members', 'documents', 'citations', 'transactions', 'assignments']) {
    const rows = value[key]
    if (Array.isArray(rows)) return rows.length
  }
  return count(value['count'])
}

/** How a `search_patents` page lists its documents: ids, or hydrated records with a `docId`. */
function publicationIdsOf(value: unknown): string[] | undefined {
  if (!isRecord(value) || !Array.isArray(value['docs'])) return undefined
  return (value['docs'] as unknown[]).flatMap(doc => typeof doc === 'string' ? [doc] : isRecord(doc) && typeof doc['docId'] === 'string' ? [doc['docId']] : [])
}

/** One recorded outcome and the mode that produced it. */
export interface RecordedOutcome {
  readonly execution: NewPatentExecution
  readonly mode: RecorderMode
}

/**
 * Map one settled tool call to a ledger record, or to nothing when the tool is not a data tool.
 * @param name - the registered tool name.
 * @param args - the frozen parsed arguments.
 * @param result - the settled outcome.
 * @param aborted - whether the caller's signal fired.
 * @returns the record and its mode, or `undefined`.
 */
export function executionOf(
  name: string,
  args: unknown,
  result: Readonly<ToolExecutionResult>,
  aborted = false,
): RecordedOutcome | undefined {
  const bare = bareToolName(name)
  const record: JsonRecord = isRecord(args) ? args : {}
  const status: NewPatentExecution['status'] = result.isError ? (aborted ? 'cancelled' : 'failed') : 'succeeded'
  const value: unknown = result.isError ? undefined : result.value
  const resultText = contentText(result.content)
  const structured = structuredSources(value)
  const mode: RecorderMode = structured === undefined ? 'derived' : 'structured'
  const publication = text(record['patent_number']) ?? text(record['publication']) ?? text(record['application_number'])

  if (bare === 'search_patents') {
    const countries = Array.isArray(record['countries']) ? (record['countries'] as unknown[]).filter((entry): entry is string => typeof entry === 'string') : undefined
    const execution: NewPatentExecution = {
      kind: 'search',
      status,
      query: text(record['query']),
      requestedRange: text(record['range']),
      requestedCountries: countries?.join(','),
      purpose: text(record['purpose']) ?? text(record['testedFeature']),
      effectiveQuery: isRecord(value) ? text(value['effectiveQuery']) : undefined,
      countryFilter: isRecord(value) && Array.isArray(value['countryFilter']) ? (value['countryFilter'] as unknown[]).filter((entry): entry is string => typeof entry === 'string') : undefined,
      total: isRecord(value) ? count(value['total']) : undefined,
      returned: isRecord(value) ? count(value['returned']) : undefined,
      publicationIds: publicationIdsOf(value),
    }
    return { execution: compact(execution), mode }
  }
  if (DETAILS_TOOLS.has(bare)) {
    const sources = status === 'succeeded' ? (structured ?? derivedSources(bare, value)) : undefined
    const publicationId = (isRecord(value) ? text(value['docId']) : undefined) ?? publication
    const claims = isRecord(value) && Array.isArray(value['claims']) ? value['claims'].length : undefined
    const execution: NewPatentExecution = {
      kind: 'details',
      status,
      publicationIds: publicationId === undefined ? undefined : [publicationId],
      publicationTitle: isRecord(value) ? text(value['title']) : undefined,
      publicationDate: isRecord(value) && isRecord(value['dates']) ? text(value['dates']['publication']) : undefined,
      sources,
      unavailableSections: status === 'succeeded' ? unavailableSections(bare, value) : undefined,
      totalClaims: isRecord(value) ? count(value['totalClaims']) : undefined,
      returnedClaims: claims,
      resultText: status === 'succeeded' && TEXT_KEPT_DETAILS.has(bare) ? resultText : undefined,
    }
    return { execution: compact(execution), mode }
  }
  if (STATUS_TOOLS.has(bare)) {
    const rows = isRecord(value) ? statusRowCount(value) : undefined
    const execution: NewPatentExecution = {
      kind: 'status',
      status,
      tool: bare as PatentRecordedTool,
      request: publication ?? JSON.stringify(record),
      publicationIds: publication === undefined ? undefined : [publication],
      rowCount: rows,
      resultText,
    }
    return { execution: compact(execution), mode }
  }
  const analytics = analyticsTool(bare)
  if (analytics !== undefined) {
    const execution: NewPatentExecution = {
      kind: 'analytics',
      status,
      tool: analytics,
      request: analyticsRequest(record),
      rowCount: isRecord(value) ? count(value['rowCount']) ?? (Array.isArray(value['rows']) ? value['rows'].length : undefined) : undefined,
      dataEdition: isRecord(value) ? text(value['dataEdition']) ?? text(value['edition']) : undefined,
      summary: isRecord(value) ? text(value['summary']) : undefined,
      publicationIds: publication === undefined ? undefined : [publication],
      resultText,
    }
    return { execution: compact(execution), mode }
  }
  return undefined
}

/** Drop the `undefined` members so a record is lossless JSON. */
function compact(execution: NewPatentExecution): NewPatentExecution {
  const entries = Object.entries(execution) as [string, unknown][]
  return Object.fromEntries(entries.filter(([, member]) => member !== undefined)) as NewPatentExecution
}

/**
 * The IDE's label for one anchor, as its text tools print it after the section.
 * @param anchor - the source anchor.
 * @returns the bracketed label.
 */
export function anchorLabel(anchor: string): string {
  return `[source anchor: ${anchor}]`
}

/**
 * The anchor lines appended to a text tool's model-facing content in derived
 * mode, or `undefined` when the result already names its anchors (structured
 * mode, or a result text that carries labels).
 * @param name - the registered tool name.
 * @param result - the settled outcome.
 * @returns one text block, or `undefined`.
 */
export function anchorLabels(name: string, result: Readonly<ToolExecutionResult>): string | undefined {
  const bare = bareToolName(name)
  if (result.isError || !TEXT_TOOLS.has(bare)) return undefined
  if (structuredSources(result.value) !== undefined) return undefined
  if (contentText(result.content).includes('[source anchor: ')) return undefined
  const sources = derivedSources(bare, result.value).filter(entry => entry.text !== undefined)
  if (sources.length === 0) return undefined
  return `Source anchors for write_patent_results (cite these in sourceAnchors; quote the returned text verbatim):\n${sources.map(entry => anchorLabel(entry.anchor)).join('\n')}`
}

/**
 * Attach the recorder to the tool registry: every settled data-tool call is
 * appended to the owning Session's ledger, and in derived mode the three text
 * tools get their anchor labels.
 * @param ctx - the plugin context, with `tools` active.
 * @param ledger - the ledger the records go to.
 * @param onMode - optional observer of the mode each record used (the README's "active mode" line, the tests).
 */
export function registerRecorder(ctx: Context, ledger: PatentLedger, onMode?: (mode: RecorderMode, tool: string) => void): void {
  ctx.on('tools/result', (exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>) => {
    const sessionId = exec.agent?.session.id
    if (sessionId === undefined) return
    const outcome = executionOf(exec.name, exec.arguments, result, exec.signal.aborted)
    if (outcome === undefined) return
    onMode?.(outcome.mode, exec.name)
    void ledger.record(sessionId, outcome.execution).catch((error: unknown) => {
      ctx.logger.warn(`flowleap-deliverables: ledger record for ${exec.name} failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  })
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (decision.kind !== 'accept' || decision.value !== undefined) return decision
    const labels = anchorLabels(exec.name, result)
    if (labels === undefined) return decision
    const content = decision.content ?? result.content
    return { ...decision, content: [...content, { type: 'text', text: labels }] }
  })
}
