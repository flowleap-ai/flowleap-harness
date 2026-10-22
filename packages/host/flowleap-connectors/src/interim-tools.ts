/**
 * INTERIM (replaced by `officeTools()` from the package): three office tools
 * written to the C2a `OfficeToolDefinition` contract so the harness registration seam
 * has real definitions to carry until `@flowleap/connectors` exports its own.
 * Names are the backend tool names; inputs follow the backend's `/v1/tools`
 * facade. Delete this module when the library's `officeTools()` lands and
 * `index.ts` registers that list instead.
 * @module
 */

import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { AcademicYearFilter, ProviderReadResult } from '@flowleap/connectors'
import { z } from 'zod'
import { missingCredential, type OfficeToolDefinition, type OfficeToolContext } from './tools.ts'
import type { ConnectorId } from './types.ts'

/** Fold a library read into the canonical result: data on success, the unified error body otherwise. */
function fromRead<T>(result: ProviderReadResult<T>, connector: ConnectorId): JsonValue {
  if (result.ok) return result.data as JsonValue
  const code = result.body.error.code
  if (code === 'data_keys_required' || code === 'odp_api_key_missing' || code === 'epo_credentials_missing') {
    return missingCredential(connector)
  }
  if (code === 'patent_provider_key_invalid') return missingCredential(connector, true)
  return { error: code, message: result.body.error.message, status: result.status }
}

/** Answer before any upstream call when the connector has no stored key. */
async function requireConnector(ctx: OfficeToolContext, connector: ConnectorId): Promise<MissingCredentialAnswer | undefined> {
  const provider = connector === 'epo-ops' ? 'epoOps' : connector === 'uspto-odp' ? 'usptoOdp' : connector === 'semantic-scholar' ? 'semanticScholar' : 'mistral'
  const lookup = await ctx.connectors.host.credentials(provider)
  return lookup.status === 'available' ? undefined : missingCredential(connector)
}

type MissingCredentialAnswer = ReturnType<typeof missingCredential>

const searchPatentsInput = z.object({
  query: z.string().min(1).describe('EPO OPS CQL query, for example `ti="solid state battery" and pd within "2020 2024"`.'),
  range: z.string().regex(/^\d+-\d+$/).default('1-25').describe('Result range as `start-end` (1-based, at most 100 per page).'),
  countries: z.string().optional().describe('Comma-separated publication countries to keep, for example `EP,WO`; omit for all.'),
  details: z.boolean().default(true).describe('Attach bibliographic details to every hit.'),
})

const getBibliographyInput = z.object({
  patentNumber: z.string().min(1).describe('Publication number, for example `EP1234567A1`, `US10000000B2`, or `WO2020123456`.'),
})

const searchAcademicInput = z.object({
  query: z.string().min(1).describe('Free-text query over Semantic Scholar and arXiv.'),
  sources: z.array(z.enum(['scholar', 'arxiv'])).optional().describe('Sources to query; default both.'),
  maxResults: z.number().int().min(1).max(50).default(10).describe('Papers to return after merging sources.'),
  fromYear: z.number().int().optional().describe('Earliest publication year.'),
  toYear: z.number().int().optional().describe('Latest publication year.'),
})

/** INTERIM: OPS published-data search. */
const searchPatents: OfficeToolDefinition<z.infer<typeof searchPatentsInput>> = {
  name: 'search_patents',
  description: 'Search EPO OPS published patents with a CQL query. Returns the total, the effective query, and the matching documents with bibliographic details. Runs with the firm\'s EPO OPS key.',
  input: searchPatentsInput,
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(input, ctx) {
    const missing = await requireConnector(ctx, 'epo-ops')
    if (missing !== undefined) return missing
    const result = await ctx.connectors.ops.searchPatents(input.query, {
      range: input.range,
      details: input.details,
      ...input.countries === undefined ? {} : { countries: input.countries },
    })
    return fromRead(result, 'epo-ops')
  },
}

/** INTERIM: OPS bibliographic data for one publication. */
const getBibliography: OfficeToolDefinition<z.infer<typeof getBibliographyInput>> = {
  name: 'get_bibliography',
  description: 'Bibliographic data for one publication from EPO OPS: title, abstract, applicants, inventors, classifications, dates, priorities, and family id. Runs with the firm\'s EPO OPS key.',
  input: getBibliographyInput,
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(input, ctx) {
    const missing = await requireConnector(ctx, 'epo-ops')
    if (missing !== undefined) return missing
    return fromRead(await ctx.connectors.ops.getBiblio(input.patentNumber), 'epo-ops')
  },
}

/** INTERIM: academic search over Semantic Scholar and arXiv; the Semantic Scholar key is optional. */
const searchAcademic: OfficeToolDefinition<z.infer<typeof searchAcademicInput>> = {
  name: 'search_academic',
  description: 'Search academic literature on Semantic Scholar and arXiv. Returns merged, ranked papers with authors, year, citations, DOI, '
    + 'and the per-source status. A Semantic Scholar key raises its rate limit; arXiv needs none.',
  input: searchAcademicInput,
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(input, ctx) {
    const filter: AcademicYearFilter | undefined = input.fromYear === undefined && input.toYear === undefined ? undefined : {
      ...input.fromYear === undefined ? {} : { fromYear: input.fromYear },
      ...input.toYear === undefined ? {} : { toYear: input.toYear },
    }
    const result = await ctx.connectors.academic.runAcademicSearch({
      query: input.query,
      maxResults: input.maxResults,
      ...input.sources === undefined ? {} : { sources: input.sources },
      ...filter === undefined ? {} : { filter },
    })
    return fromRead(result, 'semantic-scholar')
  },
}

/**
 * The interim office tools.
 * @returns the three definitions, in registration order.
 */
export function interimOfficeTools(): readonly OfficeToolDefinition[] {
  return [searchPatents, getBibliography, searchAcademic] as readonly OfficeToolDefinition[]
}
