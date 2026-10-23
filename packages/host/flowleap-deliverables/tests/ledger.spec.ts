/**
 * The evidence ledger: the recorder's two modes over a fake `tools/result`
 * stream (structured sources from the connector library, derived sources from
 * the result shape), the anchor labels the derived mode appends, the status and
 * analytics adapters, the MCP prefix, and the store's persistence through
 * `ctx.storageDomain` across a restart.
 */

import { Context } from '@deepseek-ai/cordis'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolDefinition, type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { describe, expect, it } from 'vitest'
import {
  anchorLabels, evidenceAnchor, executionOf, ledgerDomainSpec, ledgerPersistence, PatentLedger, registerRecorder,
  type RecorderMode,
} from '../src/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

const CLAIM_1 = 'A sensor system comprising a housing and a feedback loop sampled at 10 ms.'
const CLAIM_2 = 'A sensor system according to claim 1, wherein the housing is sealed.'

/** The library's `get_claims` value before flowleap-backend #611: `documentReference` per document and per claim, no `sources`. */
const CLAIMS_DERIVED = {
  docId: 'EP1000000A1',
  documentReference: { publicationNumber: 'EP1000000A1', section: 'claims' },
  language: 'en',
  totalClaims: 2,
  claims: [
    { number: '1', text: CLAIM_1, documentReference: { publicationNumber: 'EP1000000A1', section: 'claims', claimNumber: '1' } },
    { number: '2', text: CLAIM_2, documentReference: { publicationNumber: 'EP1000000A1', section: 'claims', claimNumber: '2' } },
  ],
}

/** The same value after #611: the additive `anchor` and `sources` fields, exactly as the library returns them. */
const CLAIMS_STRUCTURED = {
  ...CLAIMS_DERIVED,
  anchor: 'EP1000000A1:claims:en',
  sources: [
    { anchor: 'EP1000000A1:claims:en', reference: { publicationNumber: 'EP1000000A1', section: 'claims' }, language: 'en', text: `${CLAIM_1}\n\n${CLAIM_2}`, retrieval: 'returned' },
    { anchor: 'EP1000000A1:claims:1:en', reference: { publicationNumber: 'EP1000000A1', section: 'claims', claimNumber: '1' }, language: 'en', text: CLAIM_1, retrieval: 'returned' },
    { anchor: 'EP1000000A1:claims:2:en', reference: { publicationNumber: 'EP1000000A1', section: 'claims', claimNumber: '2' }, language: 'en', text: CLAIM_2, retrieval: 'returned' },
  ],
}

function success(value: JsonValue): ToolExecutionResult {
  return { isError: false, value, content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

describe('executionOf: the per-tool adapters', () => {
  it('derives claim sources from the connector result shape, with the IDE anchors, when the result carries no sources', () => {
    const outcome = executionOf('get_claims', { patent_number: 'EP1000000A1' }, success(CLAIMS_DERIVED))
    expect(outcome?.mode).toBe('derived')
    expect(outcome?.execution).toEqual({
      kind: 'details', status: 'succeeded', publicationIds: ['EP1000000A1'], totalClaims: 2, returnedClaims: 2,
      sources: [
        { anchor: 'EP1000000A1:claims:1:en', reference: { publicationNumber: 'EP1000000A1', section: 'claims', claimNumber: '1' }, language: 'en', text: CLAIM_1, retrieval: 'returned', review: 'unknown', completeness: 'unknown' },
        { anchor: 'EP1000000A1:claims:2:en', reference: { publicationNumber: 'EP1000000A1', section: 'claims', claimNumber: '2' }, language: 'en', text: CLAIM_2, retrieval: 'returned', review: 'unknown', completeness: 'unknown' },
        { anchor: 'EP1000000A1:claims:en', reference: { publicationNumber: 'EP1000000A1', section: 'claims' }, language: 'en', text: `${CLAIM_1}\n\n${CLAIM_2}`, retrieval: 'returned', review: 'unknown', completeness: 'unknown' },
      ],
    })
    expect(evidenceAnchor({ publicationNumber: 'EP1000000A1', section: 'claims', claimNumber: '2' }, 'en')).toBe('EP1000000A1:claims:2:en')
  })

  it('maps the library\'s structured sources straight into the ledger when the result carries them (flowleap-backend #611)', () => {
    const outcome = executionOf('get_claims', { patent_number: 'EP1000000A1' }, success(CLAIMS_STRUCTURED))
    expect(outcome?.mode).toBe('structured')
    expect(outcome?.execution.sources?.map(source => [source.anchor, source.text, source.retrieval, source.review])).toEqual([
      ['EP1000000A1:claims:en', `${CLAIM_1}\n\n${CLAIM_2}`, 'returned', 'unknown'],
      ['EP1000000A1:claims:1:en', CLAIM_1, 'returned', 'unknown'],
      ['EP1000000A1:claims:2:en', CLAIM_2, 'returned', 'unknown'],
    ])
    // A source whose anchor does not match its reference is dropped on its own, not the whole record.
    const mixed = executionOf('get_description', { patent_number: 'EP1000000A1' }, success({
      docId: 'EP1000000A1', documentReference: { publicationNumber: 'EP1000000A1', section: 'description' }, description: 'Body.',
      sources: [
        { anchor: 'EP1000000A1:description:en', reference: { publicationNumber: 'EP1000000A1', section: 'description' }, language: 'en', text: 'Body.', retrieval: 'returned' },
        { anchor: 'WRONG', reference: { publicationNumber: 'EP1000000A1', section: 'description' }, text: 'Body.', retrieval: 'returned' },
      ],
    }))
    expect(mixed?.execution.sources?.map(source => source.anchor)).toEqual(['EP1000000A1:description:en'])
  })

  it('derives description, abstract and bibliography sources, and names a section that came back empty', () => {
    const description = executionOf('get_description', { patent_number: 'EP1000000A1', language: 'de' }, success({
      docId: 'EP1000000A1', documentReference: { publicationNumber: 'EP1000000A1', section: 'description' }, description: 'Die Beschreibung.', language: 'de',
    }))
    const abstract = executionOf('get_abstract', { patent_number: 'EP1000000A1' }, success({
      docId: 'EP1000000A1', documentReference: { publicationNumber: 'EP1000000A1', section: 'abstract' }, abstract: 'Kurz.', lang: 'de',
    }))
    const biblio = executionOf('get_bibliography', { patent_number: 'EP1000000A1' }, success({
      docId: 'EP1000000A1', documentReference: { publicationNumber: 'EP1000000A1', section: 'bibliography' }, title: 'Sensor', abstract: 'Kurz.', dates: { publication: '2000-01-05' },
    }))
    const empty = executionOf('get_description', { patent_number: 'EP1000000A1' }, success({
      docId: 'EP1000000A1', documentReference: { publicationNumber: 'EP1000000A1', section: 'description' }, description: null, language: 'en',
    }))
    expect({
      description: description?.execution.sources?.map(source => [source.anchor, source.text]),
      abstract: abstract?.execution.sources?.map(source => [source.anchor, source.text]),
      biblio: [
        biblio?.execution.publicationTitle, biblio?.execution.publicationDate, biblio?.execution.sources?.map(source => source.anchor),
      ],
      empty: [empty?.execution.sources, empty?.execution.unavailableSections],
    }).toEqual({
      description: [['EP1000000A1:description:de', 'Die Beschreibung.']],
      abstract: [['EP1000000A1:abstract:de', 'Kurz.']],
      biblio: ['Sensor', '2000-01-05', ['EP1000000A1:bibliography']],
      empty: [[], ['description']],
    })
  })

  it('records a search page, a status read, a paid MCP analytics call under its IDE identity, and a failed read', () => {
    const search = executionOf('search_patents', { query: 'ti=sensor', countries: ['EP', 'WO'] }, success({
      total: 12, returned: 2, effectiveQuery: 'ti=sensor and pn any "EP WO"', countryFilter: ['EP', 'WO'], docs: [{ docId: 'EP1000000A1' }, 'WO2000000001A1'],
    }))
    const status = executionOf('get_legal_status', { patent_number: 'EP1000000A1' }, success({ docId: 'EP1000000A1', events: [{ code: 'PGFP' }, { code: 'MM4A' }] }))
    const paid = executionOf('mcp__flowleap__patstat_query', { sql: 'SELECT 1' }, { isError: false, value: 'rows', content: [{ type: 'text', text: 'one row' }] })
    const failed = executionOf('get_claims', { patent_number: 'EP9' }, { isError: true, error: { message: 'OPS 404' }, content: [{ type: 'text', text: 'Error: OPS 404' }] })
    const cancelled = executionOf('search_patents', { query: 'q' }, { isError: true, error: { message: 'aborted' }, content: [] }, true)
    const shell = executionOf('bash', { command: 'flowleap patent examiner-baseline EP1' }, { isError: false, value: 'out', content: [{ type: 'text', text: 'out' }] })
    expect({ search: search?.execution, status: status?.execution, paid: paid?.execution, failed: failed?.execution, cancelled: cancelled?.execution.status, shell: shell?.execution.tool, other: executionOf('present', {}, success('x')) }).toEqual({
      search: { kind: 'search', status: 'succeeded', query: 'ti=sensor', requestedCountries: 'EP,WO', effectiveQuery: 'ti=sensor and pn any "EP WO"', countryFilter: ['EP', 'WO'], total: 12, returned: 2, publicationIds: ['EP1000000A1', 'WO2000000001A1'] },
      status: { kind: 'status', status: 'succeeded', tool: 'get_legal_status', request: 'EP1000000A1', publicationIds: ['EP1000000A1'], rowCount: 2, resultText: JSON.stringify({ docId: 'EP1000000A1', events: [{ code: 'PGFP' }, { code: 'MM4A' }] }, null, 2) },
      paid: { kind: 'analytics', status: 'succeeded', tool: 'patstat_query', request: 'SELECT 1', resultText: 'one row' },
      failed: { kind: 'details', status: 'failed', publicationIds: ['EP9'] },
      cancelled: 'cancelled',
      shell: 'run_in_terminal',
      other: undefined,
    })
  })

  it('labels the anchors of a derived text result for the model, and stays silent when the result already names them', () => {
    expect(anchorLabels('get_claims', success(CLAIMS_DERIVED))).toBe([
      'Source anchors for write_patent_results (cite these in sourceAnchors; quote the returned text verbatim):',
      '[source anchor: EP1000000A1:claims:1:en]',
      '[source anchor: EP1000000A1:claims:2:en]',
      '[source anchor: EP1000000A1:claims:en]',
    ].join('\n'))
    expect(anchorLabels('get_claims', success(CLAIMS_STRUCTURED))).toBeUndefined()
    expect(anchorLabels('get_legal_status', success({ docId: 'EP1000000A1', events: [] }))).toBeUndefined()
    const labelled: ToolExecutionResult = { isError: false, value: CLAIMS_DERIVED, content: [{ type: 'text', text: 'claims [source anchor: EP1000000A1:claims:1:en]' }] }
    expect(anchorLabels('get_claims', labelled)).toBeUndefined()
  })
})

/** A registry with one fake office tool whose value the test chooses, and the recorder on it. */
async function bench(value: JsonValue, name = 'get_claims') {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const ledger = new PatentLedger(() => new Date('2026-10-23T10:00:00Z'))
  const modes: [RecorderMode, string][] = []
  registerRecorder(ctx, ledger, (mode, tool) => { modes.push([mode, tool]) })
  const definition: ToolDefinition = {
    name,
    description: 'fake',
    parameters: { type: 'object', properties: { patent_number: { type: 'string' } } },
    output: { schema: {}, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
    execute: () => Promise.resolve(value),
  }
  ctx.tools.register(definition)
  const agent = { id: 'session-1', session: { id: 'session-1' } } as never
  const call = (args: unknown) => ctx.tools.execute({ callId: 'c1' as ToolCallId, name, arguments: args, signal: new AbortController().signal, agent })
  return { ctx, ledger, modes, call }
}

describe('the recorder on a tools/result stream', () => {
  it('records the owning session\'s outcome from the settled result and appends the anchor labels to the model-facing content', async () => {
    const { ledger, modes, call } = await bench(CLAIMS_DERIVED)
    const result = await call({ patent_number: 'EP1000000A1' })
    const snapshot = await ledger.read('session-1')
    expect({
      modes,
      executions: snapshot.executions.map(execution => [execution.kind, execution.status, execution.sources?.length, execution.recordedAt]),
      labels: result.content.at(-1),
      limitation: snapshot.limitation.startsWith('Audit covers recorded search_patents, get_claims'),
      other: (await ledger.read('session-2')).executions,
    }).toEqual({
      modes: [['derived', 'get_claims']],
      executions: [['details', 'succeeded', 3, '2026-10-23T10:00:00.000Z']],
      limitation: true,
      labels: { type: 'text', text: 'Source anchors for write_patent_results (cite these in sourceAnchors; quote the returned text verbatim):\n[source anchor: EP1000000A1:claims:1:en]\n[source anchor: EP1000000A1:claims:2:en]\n[source anchor: EP1000000A1:claims:en]' },
      other: [],
    })
  })

  it('leaves a structured result\'s content alone and records its sources as returned', async () => {
    const { ledger, modes, call } = await bench(CLAIMS_STRUCTURED)
    const result = await call({ patent_number: 'EP1000000A1' })
    expect(result.content).toHaveLength(1)
    expect(modes).toEqual([['structured', 'get_claims']])
    expect((await ledger.read('session-1')).executions[0]?.sources?.map(source => source.anchor)).toEqual(['EP1000000A1:claims:en', 'EP1000000A1:claims:1:en', 'EP1000000A1:claims:2:en'])
  })
})

describe('the ledger store', () => {
  /** The storage hub with one in-memory backend and the domain facility over it. */
  async function storage(pool: MemoryMediaPool) {
    const ctx = new Context()
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    return facility
  }

  it('persists a session\'s records through the storage domain and hydrates them after a restart, disclosing an unreadable one', async () => {
    const pool = new MemoryMediaPool()
    const first = new PatentLedger()
    const domain = await (await storage(pool)).open(ledgerDomainSpec)
    first.attach(ledgerPersistence(domain))
    await first.record('s', { kind: 'search', status: 'succeeded', query: 'brake' })
    await first.record('s', { kind: 'search', status: 'failed', query: 'software', purpose: 'p'.repeat(300) })
    await first.record('other', { kind: 'status', status: 'succeeded', tool: 'get_legal_status', request: 'EP1' })
    const stored = domain.table('sessions').get('s')
    await domain.table('sessions').put('s', { executions: [...stored?.executions ?? [], { id: 'bad', status: 'succeeded' }] })
    await domain.close()

    const second = new PatentLedger()
    second.attach(ledgerPersistence(await (await storage(pool)).open(ledgerDomainSpec)))
    const snapshot = await second.read('s')
    expect({
      queries: snapshot.executions.map(execution => [execution.query, execution.status]),
      capped: snapshot.executions[1]?.purpose?.endsWith('… [truncated for the audit record]'),
      disclosure: snapshot.limitation.startsWith('Some audit records are unreadable or incomplete. '),
      other: (await second.read('other')).executions.map(execution => execution.tool),
      none: (await second.read('nobody')).executions,
    }).toEqual({ queries: [['brake', 'succeeded'], ['software', 'failed']], capped: true, disclosure: true, other: ['get_legal_status'], none: [] })
  })

  it('keeps records in memory without storage and forgets a disposed session', async () => {
    const ledger = new PatentLedger()
    await ledger.record('s', { kind: 'details', status: 'succeeded', publicationIds: ['EP1'] })
    expect((await ledger.read('s')).executions).toHaveLength(1)
    ledger.forget('s')
    expect((await ledger.read('s')).executions).toEqual([])
  })
})
