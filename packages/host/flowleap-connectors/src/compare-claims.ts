/**
 * The native `compare_claims` tool (S5 D1 lane d): the IDE's claim-comparison
 * package, run on the firm's own keys. It fetches the claims of each cited
 * patent through the connector library's text router (`connectors.fulltext`,
 * the path the office `get_claims` tool takes: EP and WO on the firm's EPO OPS
 * key, a US number answered with the paid-route hint), decomposes each
 * patent's independent claim deterministically, and returns the user claim,
 * an element-by-element claim chart, the bounded full claim text and the
 * analysis rubric. The model performs the comparison itself. The name, the
 * input schema and the result text are the IDE's, so the exported Patent
 * Agent prompt's `compare_claims` references resolve in the harness.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition as DshToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { ErrorCodes, type Connectors, type ProviderReadFailure } from '@flowleap/connectors'
import { PROVIDER_OF_CONNECTOR } from './credentials.ts'
import type { BoundConnectorHost } from './host.ts'
import { missingCredential, renderText, type MissingCredentialResult } from './tools.ts'

/** The tool name, shared with the IDE's tool of the same name. */
export const COMPARE_CLAIMS_NAME = 'compare_claims'

/** Most patents one call compares; the IDE's cap against timeouts. */
export const COMPARE_CLAIMS_MAX_PATENTS = 10

/** Per-patent cap on the full claim text rendered below the chart (the IDE's `ToolResponseBudgets.CompareClaimsText`). */
export const COMPARE_CLAIMS_TEXT_BUDGET = 4000

/** Max characters of an element's text shown inside a claim-chart cell before it is elided. */
const CLAIM_CHART_CELL_LIMIT = 120

/** The model-facing arguments, the IDE's. */
export interface CompareClaimsArgs {
  /** The user's patent claim or invention description to compare. */
  userClaim: string
  /** Publication numbers to compare against, e.g. `EP-1234567-A1`. */
  patentNumbers: string[]
}

/** The claims of one requested patent, or why they are missing. */
export type FetchedClaims = {
  /** The number as the model gave it; the column header. */
  patentNumber: string
  /** The claim texts in order, at least one. */
  claims: string[]
  failureReason?: never
} | FailedClaims

/** A requested patent without claims. */
interface FailedClaims {
  /** The number as the model gave it. */
  patentNumber: string
  /** No claims came back. */
  claims: null
  /** The one-line reason. */
  failureReason: string
}

/** The canonical value of a comparison. */
export interface CompareClaimsValue {
  /** One entry per requested patent, in request order. */
  patents: {
    /** The number as the model gave it. */
    patentNumber: string
    /** Claims fetched; `0` when none came back. */
    claimCount: number
    /** The reason when no claims came back. */
    failureReason?: string
  }[]
  /** The comparison package the model reads. */
  markdown: string
}

/** The JSON Schema the model sees: the IDE's `compare_claims` input schema. */
const PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    userClaim: {
      type: 'string',
      description: 'The user\'s patent claim or invention description to compare',
    },
    patentNumbers: {
      type: 'array',
      items: { type: 'string' },
      description: 'Array of patent publication numbers to compare against (e.g., [\'US-7654321-B2\', \'EP-1234567-A1\'])',
    },
  },
  required: ['userClaim', 'patentNumbers'],
}

const DESCRIPTION = 'Compare a user\'s patent claim against one or more existing patents to identify overlaps and differences. '
  + 'WORKFLOW: (1) First decompose the user\'s claim into elements yourself, (2) Use search_patents to find potentially relevant patents, (3) Then use THIS tool to compare the user\'s claim against specific patent numbers. '
  + 'Fetches the actual claims of each cited patent on the firm\'s EPO OPS key and returns them alongside the user\'s claim with an element-by-element claim chart and an analysis rubric — YOU then perform the comparison: relevance (HIGH/MEDIUM/LOW), overlapping elements, missing elements (potential novelty), key differences, and a 102/103 risk summary. '
  + `NOTE: EPO OPS full text covers EP and WO publications; US claims are a paid FlowLeap service, and the result names the tool to call for them. At most ${String(COMPARE_CLAIMS_MAX_PATENTS)} patents per call. `
  + 'Useful for patentability assessment, freedom-to-operate analysis, and prior art evaluation.'

/** Truncates `text` to at most `max` characters, appending an ellipsis when the text was cut. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.substring(0, max)}…` : text
}

/**
 * One decomposed segment of a claim. The preamble is the introductory phrase up to and including the
 * transitional word (`comprising`, `consisting of`, …); each subsequent limitation is a clause of the
 * claim body.
 */
export interface ClaimElement {
  /** Stable row label, e.g. `Preamble` or `Element 1`. */
  readonly label: string
  /** The segment text. */
  readonly text: string
  /** Whether this is the preamble or a body limitation. */
  readonly type: 'preamble' | 'limitation'
}

/** Regexes shared by claim decomposition; declared once so the deterministic split has no per-call cost. */
const CLAIM_NUMBER_PREFIX = /^\s*\(?\d+\)?[.)]\s*/u
const CLAIM_TRANSITION = new RegExp(
  String.raw`\b(?<transition>consisting essentially of|consisting of|comprising|including|containing|having|characteri[sz]ed in that)\b`,
  'iu',
)
const CLAIM_DEPENDENCY = new RegExp(
  String.raw`\b(?:of|according to|as (?:claimed|recited|set forth|defined) in|as in)\s+(?:any\s+)?(?:one\s+of\s+)?(?:preceding\s+)?claims?\b`,
  'iu',
)
const CLAIM_CLAUSE_LABEL = /^\(?[a-z0-9]{1,3}\)[.)]?\s+/iu

/**
 * Picks the claim to chart for a patent: the first claim that does not depend on another claim, falling
 * back to the first claim when every claim looks dependent (or the set has only one entry).
 * @param claims - the patent's claims in order, at least one.
 * @returns the claim text to decompose.
 */
export function selectIndependentClaim(claims: readonly string[]): string {
  return claims.find(claim => !CLAIM_DEPENDENCY.test(claim)) ?? claims[0] ?? ''
}

/**
 * Deterministically decomposes a single claim into its elements — no language-model call. The preamble
 * is split off at the transitional phrase; the body is then split into limitations on semicolons (the
 * standard claim-drafting delimiter), with leading clause labels like `(a)`/`1.` and trailing
 * conjunctions stripped so each row reads as a self-contained limitation.
 * @param rawClaim - the claim text, with or without its number.
 * @returns the preamble (when a transition is found) and the limitations; empty for a blank claim.
 */
export function decomposeClaim(rawClaim: string): ClaimElement[] {
  const claim = rawClaim.replace(CLAIM_NUMBER_PREFIX, '').trim()
  if (!claim) {
    return []
  }

  const elements: ClaimElement[] = []
  let body = claim

  const transition = CLAIM_TRANSITION.exec(claim)
  if (transition) {
    const cut = transition.index + transition[0].length
    elements.push({ label: 'Preamble', text: claim.slice(0, cut).trim(), type: 'preamble' })
    body = claim.slice(cut).replace(/^[:\s]+/u, '').trim()
  }

  const limitations = body
    .split(/;\s*(?:and\b|or\b)?/iu)
    .map(part => part.replace(CLAIM_CLAUSE_LABEL, '').replace(/[.,;]+\s*$/u, '').trim())
    .filter(part => part.length > 0)

  for (const [index, text] of limitations.entries()) {
    elements.push({ label: `Element ${String(index + 1)}`, text, type: 'limitation' })
  }

  if (elements.length === 0) {
    elements.push({ label: 'Element 1', text: claim, type: 'limitation' })
  }
  return elements
}

/**
 * Renders a GitHub-flavored markdown table. Cell and header text has pipes and newlines escaped so a
 * value can never break the table structure.
 * @param headers - the column headers, left-aligned.
 * @param rows - the rows, each one cell per header.
 * @returns the table.
 */
function renderMarkdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const escape = (value: string): string => value.replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ')
  const line = (cells: readonly string[]): string => `| ${cells.map(escape).join(' | ')} |`
  return [line(headers), `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map(line)].join('\n')
}

/** The IDE's truncation notice for the claims dropped by the per-patent text budget. */
function truncationNotice(omittedItems: number, budget: number): string {
  return `Response exceeded this tool's ${String(budget)}-character budget. ${String(omittedItems)} result item(s) were omitted to keep the output valid JSON. `
    + 'Refine your query — add filters, narrow the date range, or request fewer results — to retrieve the omitted items.'
}

/**
 * Render the element-by-element claim chart: one row per element of the reference patent (the first
 * patent with claims), one column per patent, each cell holding the positionally-aligned element of
 * that patent's independent claim (bounded snippet) or `—` when it has no element at that position.
 */
function renderClaimChart(withClaims: readonly (FetchedClaims & { claims: string[] })[]): string[] {
  const decompositions = withClaims.map(fetched => ({
    patentNumber: fetched.patentNumber,
    elements: decomposeClaim(selectIndependentClaim(fetched.claims)),
  }))
  const reference = decompositions[0]
  if (reference === undefined) return []

  const rows = reference.elements.map((element, index) => [
    element.label,
    ...decompositions.map((decomposition) => {
      const aligned = decomposition.elements[index]
      return aligned ? truncate(aligned.text, CLAIM_CHART_CELL_LIMIT) : '—'
    }),
  ])
  const headers = ['Claim Element', ...decompositions.map(decomposition => decomposition.patentNumber)]

  return [
    '### Element-by-Element Claim Chart',
    `Rows are the elements of the reference patent (${reference.patentNumber}); \`—\` means that patent's independent claim has no element at that position. Correspondence is positional — verify it against the full claim text below.`,
    '',
    renderMarkdownTable(headers, rows),
  ]
}

/**
 * Render a patent's full claim text as a fenced block bounded by the per-patent text budget: whole
 * claims are kept in order until the budget is reached, and the truncation notice reports how many
 * were dropped.
 */
function renderBoundedClaims(claims: readonly string[]): string {
  const budget = COMPARE_CLAIMS_TEXT_BUDGET
  const kept: string[] = []
  let used = 0
  let omitted = 0
  for (const [index, claim] of claims.entries()) {
    const addition = claim.length + (kept.length > 0 ? 2 : 0)
    if (kept.length > 0 && used + addition > budget) {
      omitted = claims.length - index
      break
    }
    kept.push(claim)
    used += addition
  }

  const text = truncate(kept.join('\n\n'), budget)
  const block = ['```', text, '```']
  if (omitted > 0) {
    block.push('', `> ${truncationNotice(omitted, budget)}`)
  }
  return block.join('\n')
}

/**
 * Assemble the user claim and the fetched prior-art claims into a comparison package: an
 * element-by-element claim chart (deterministic decomposition of each patent's independent claim),
 * the bounded full claim text per patent, and an analysis rubric for the model. The IDE's text, with
 * the tool names it points to resolved to this host's (`get_claims`, `get_description`); the IDE's `get_us_grant` hint is
 * dropped because the paid-route sentence in the failure reason is the correct instruction here.
 * @param userClaim - the user's claim or invention description.
 * @param fetched - one entry per requested patent, in request order; at least one with claims.
 * @returns the Markdown package.
 */
export function formatComparisonPackage(userClaim: string, fetched: readonly FetchedClaims[]): string {
  const withClaims = fetched.filter((entry): entry is FetchedClaims & { claims: string[] } => entry.claims !== null)

  const lines: string[] = [
    '## Prior Art Claim Comparison Package',
    '',
    '### User Claim',
    '```',
    userClaim.trim(),
    '```',
    '',
  ]

  lines.push(...renderClaimChart(withClaims))

  lines.push('', '### Full Claim Text', '')
  for (const entry of fetched) {
    lines.push(`#### ${entry.patentNumber}`)
    lines.push(entry.claims === null ? `Claims unavailable (${entry.failureReason}).` : renderBoundedClaims(entry.claims))
    lines.push('')
  }

  lines.push(
    '---',
    '### Analysis Instructions',
    'The chart above is a positional decomposition scaffold; confirm the actual element correspondence against the full claim text, then perform an element-by-element comparison of the user claim against each prior-art claim set. For each patent, report:',
    '1. **Relevance** — HIGH (anticipates most/all elements), MEDIUM (discloses several elements), or LOW.',
    '2. **Overlapping elements** — user-claim elements disclosed by the prior art, citing the specific claim number.',
    '3. **Missing elements** — user-claim elements NOT found in the prior art (potential novelty).',
    '4. **Key differences** — material differences in scope or implementation.',
    '',
    'Then summarize: HIGH-relevance patents raise §102 (anticipation) risk; combinations of MEDIUM-relevance patents may support §103 (obviousness) rejections. Use get_description for full descriptions of specific patents if needed.',
  )

  return lines.join('\n')
}

/** The text of the all-failed answer: every reason, then where claims come from. */
function noClaimsAnswer(fetched: readonly FailedClaims[]): string {
  const failures = fetched.map(entry => `- ${entry.patentNumber}: ${entry.failureReason}`).join('\n')
  return `Could not retrieve claims for any of the requested patents:\n${failures}\n\n`
    + 'Claims are not published for every office and document. Fetch them with get_claims, '
    + 'then compare manually.'
}

/** Validate the raw arguments; the registry hands them over as parsed JSON. */
function parseArgs(args: unknown): CompareClaimsArgs {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new Error(`${COMPARE_CLAIMS_NAME}: invalid arguments: expected an object`)
  const record = args as Record<string, unknown>
  const userClaim = record['userClaim']
  if (typeof userClaim !== 'string') throw new Error(`${COMPARE_CLAIMS_NAME}: invalid arguments: userClaim must be a string`)
  if (userClaim.trim().length === 0) throw new Error(`${COMPARE_CLAIMS_NAME}: no user claim provided`)
  const patentNumbers = record['patentNumbers']
  if (!Array.isArray(patentNumbers) || !patentNumbers.every((entry): entry is string => typeof entry === 'string')) {
    throw new Error(`${COMPARE_CLAIMS_NAME}: invalid arguments: patentNumbers must be an array of strings`)
  }
  if (patentNumbers.length === 0) throw new Error(`${COMPARE_CLAIMS_NAME}: no patent numbers provided for comparison`)
  return { userClaim, patentNumbers }
}

/** The EPO OPS key answer a router failure stands for, or `undefined` when it is another failure. */
function missingCredentialOf(failure: ProviderReadFailure): MissingCredentialResult | undefined {
  const { code } = failure.body.error
  if (code === ErrorCodes.data_keys_required) return missingCredential('epo-ops')
  if (code === ErrorCodes.patent_provider_key_invalid) return missingCredential('epo-ops', true)
  return undefined
}

/** A router failure that must end the whole call: a key the host lacks or EPO refused. */
class KeyFailure extends Error {
  constructor(readonly result: MissingCredentialResult) {
    super(result.message)
    this.name = 'KeyFailure'
  }
}

/**
 * Fetch the claims of one patent through the text router. A per-patent failure (no source for the
 * office, the paid-route hint for a US number, a 404) is reported inline rather than failing the whole
 * comparison; a key failure propagates so the call answers with the missing-credential text.
 */
async function fetchClaims(connectors: Connectors, patentNumber: string): Promise<FetchedClaims> {
  const docId = patentNumber.replace(/[-.\s/]/gu, '').toUpperCase()
  const result = await connectors.fulltext.getClaimsRouted(docId, 'en')
  if (!result.ok) {
    const missing = missingCredentialOf(result)
    if (missing !== undefined) throw new KeyFailure(missing)
    return { patentNumber, claims: null, failureReason: `${String(result.status)} - ${result.body.error.message}` }
  }
  const claims = result.data.numberedClaims?.map(claim => claim.text) ?? result.data.claims
  if (claims.length === 0) {
    return { patentNumber, claims: null, failureReason: 'no claims returned' }
  }
  return { patentNumber, claims }
}

/**
 * Build the `compare_claims` definition over the shared connector library.
 * @param ctx - the plugin context, for its logger.
 * @param connectors - the shared library instance.
 * @param bound - the host's signal carrier.
 * @returns the unregistered dsh definition.
 */
export function compareClaimsTool(ctx: Context, connectors: Connectors, bound: BoundConnectorHost): DshToolDefinition {
  return {
    name: COMPARE_CLAIMS_NAME,
    description: DESCRIPTION,
    parameters: PARAMETERS,
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: isCompareClaimsValue(value) ? value.markdown : renderText(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args: unknown, exec: ToolRunContext): Promise<JsonValue> {
      const { userClaim, patentNumbers } = parseArgs(args)
      // The key before any fetch: the same plain answer the office `get_claims` gives.
      if ((await connectors.host.credentials(PROVIDER_OF_CONNECTOR['epo-ops'])).status !== 'available') return missingCredential('epo-ops')

      const limited = patentNumbers.slice(0, COMPARE_CLAIMS_MAX_PATENTS)
      if (patentNumbers.length > COMPARE_CLAIMS_MAX_PATENTS) {
        ctx.logger.warn(`${COMPARE_CLAIMS_NAME}: limiting comparison to the first ${String(COMPARE_CLAIMS_MAX_PATENTS)} patents (received ${String(patentNumbers.length)})`)
      }

      let fetched: FetchedClaims[]
      try {
        fetched = await bound.withSignal(exec.signal, () => Promise.all(limited.map(patentNumber => fetchClaims(connectors, patentNumber))))
      } catch (error) {
        if (error instanceof KeyFailure) return error.result
        throw error
      }
      const failed = fetched.filter((entry): entry is FailedClaims => entry.claims === null)
      ctx.logger.info(`${COMPARE_CLAIMS_NAME}: fetched claims for ${String(fetched.length - failed.length)}/${String(fetched.length)} patents`)

      const markdown = failed.length === fetched.length ? noClaimsAnswer(failed) : formatComparisonPackage(userClaim, fetched)
      const value: CompareClaimsValue = {
        patents: fetched.map(entry => ({
          patentNumber: entry.patentNumber,
          claimCount: entry.claims?.length ?? 0,
          ...entry.failureReason === undefined ? {} : { failureReason: entry.failureReason },
        })),
        markdown,
      }
      return { ...value }
    },
  }
}

/** Whether a canonical value is a comparison rather than a missing-credential answer. */
function isCompareClaimsValue(value: JsonValue): value is CompareClaimsValue & JsonValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof value['markdown'] === 'string' && Array.isArray(value['patents'])
}

/**
 * Register `compare_claims` on `ctx.tools`.
 * @param ctx - a context whose `tools` is active.
 * @param connectors - the shared library instance.
 * @param bound - the host's signal carrier.
 * @returns the disposer unregistering the tool.
 */
export function registerCompareClaimsTool(ctx: Context, connectors: Connectors, bound: BoundConnectorHost): () => void {
  return ctx.tools.register(compareClaimsTool(ctx, connectors, bound))
}
