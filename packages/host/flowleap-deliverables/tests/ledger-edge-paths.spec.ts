/**
 * The evidence ledger on the inputs the main ledger spec does not reach: the recorder's adapters on
 * odd and partial tool values, the analytics identities, the untrusted-storage readers on each
 * kind of unusable field, the source index that prefers official text, and the store when a write
 * fails, a record comes back partial, or a record lands while the stored ones load.
 */

import { Context } from '@deepseek-ai/cordis'
import { ToolCallId, type ImageBlock } from '@deepseek-ai/dsh-llm'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { describe, expect, it } from 'vitest'
import {
  anchorLabels, contentText, derivedSources, evidenceSourceIndex, executionOf, figureAnchor, ledgerDomainSpec, ledgerPersistence,
  PatentLedger, readEvidenceSource, readPatentExecution, registerRecorder, structuredSources, webPageHost, type PatentEvidenceSource,
} from '../src/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

const reference = { publicationNumber: 'EP1', section: 'claims' }

function success(value: JsonValue, text = JSON.stringify(value)): ToolExecutionResult {
  return { isError: false, value, content: [{ type: 'text', text }] }
}

/** The record an execution maps to, without the mode. */
function recordOf(name: string, args: unknown, value: JsonValue) {
  return executionOf(name, args, success(value, 'result'))?.execution
}

describe('the recorder adapters', () => {
  it('joins only the text blocks of a result', () => {
    const image: ImageBlock = {
      type: 'image',
      attachment: { attachmentId: 'attachment-1' as ImageBlock['attachment']['attachmentId'], mediaType: 'image/png', bytes: 4, width: 1, height: 1 },
    }
    expect(contentText([{ type: 'text', text: 'a' }, image, { type: 'text', text: 'b' }])).toBe('a\nb')
  })

  it('records each analytics tool under its IDE identity with the argument that names the call', () => {
    const rows = [
      recordOf('patstat_cpc', { query: 'B60' }, { rowCount: 3, edition: '2026a', summary: 'Top CPC' }),
      recordOf('patent_analytics', { publication: 'EP1' }, { rows: [1, 2] }),
      recordOf('web_fetch', { url: 'https://example.com' }, 'page'),
      recordOf('pwsh', { command: 'dir' }, { dataEdition: 'local' }),
      recordOf('mcp__flowleap__examiner_baseline', { other: 1 }, { rowCount: -1 }),
      recordOf('read_pdf', 'not an object', {}),
    ]
    expect(rows.map(row => row && [row.tool, row.request, row.rowCount, row.dataEdition, row.summary, row.publicationIds])).toEqual([
      ['patstat_graph', 'B60', 3, '2026a', 'Top CPC', undefined],
      ['patent_analytics_viz', 'EP1', 2, undefined, undefined, ['EP1']],
      ['fetch_webpage', 'https://example.com', undefined, undefined, undefined, undefined],
      ['run_in_terminal', 'dir', undefined, 'local', undefined, undefined],
      ['examiner_baseline', '{"other":1}', undefined, undefined, undefined, undefined],
      ['read_pdf', '{}', undefined, undefined, undefined, undefined],
    ])
    expect(recordOf('compare_patents', {}, {})).toBeUndefined()
  })

  it('records a status read without a publication or a row count, and a details read of a non-object value', () => {
    expect({
      status: recordOf('get_legal_status', { office: 'EP' }, 'no rows'),
      count: recordOf('get_family', { patent_number: 'EP1' }, { count: 4 }),
      details: recordOf('get_description', {}, 'plain text'),
      fulltext: recordOf('get_fulltext', { publication: 'EP1' }, { documentReference: reference, text: 'Full text' }),
    }).toEqual({
      status: { kind: 'status', status: 'succeeded', tool: 'get_legal_status', request: '{"office":"EP"}', resultText: 'result' },
      count: { kind: 'status', status: 'succeeded', tool: 'get_family', request: 'EP1', publicationIds: ['EP1'], rowCount: 4, resultText: 'result' },
      details: { kind: 'details', status: 'succeeded', sources: [] },
      fulltext: { kind: 'details', status: 'succeeded', publicationIds: ['EP1'], sources: [] },
    })
  })

  it('names the sections a details read did not return', () => {
    const missing = (name: string, value: JsonValue) => recordOf(name, { patent_number: 'EP1' }, value)?.unavailableSections
    expect([
      missing('get_description', { documentReference: { ...reference, section: 'description' } }),
      missing('get_abstract', { documentReference: { ...reference, section: 'abstract' } }),
      missing('get_claims', { documentReference: reference, claims: [] }),
      missing('get_claims', { documentReference: reference, unsegmentedText: 'All claims' }),
      missing('get_bibliography', { documentReference: { ...reference, section: 'bibliography' } }),
    ]).toEqual([['description'], ['abstract'], ['claims'], undefined, undefined])
  })

  it('derives claim sources only from claims with a reference and a text, and keeps unsegmented claims as one source', () => {
    const claim = { documentReference: { ...reference, claimNumber: '1' }, text: 'A hinge.' }
    expect({
      notRecord: derivedSources('get_claims', null),
      noReference: derivedSources('get_claims', { claims: [claim] }),
      noClaims: derivedSources('get_claims', { documentReference: reference, claims: 'none', lang: 'de' }),
      partial: derivedSources('get_claims', { documentReference: reference, claims: ['x', { text: 'No reference.' }, { documentReference: reference }, claim] }).map(source => source.anchor),
      unsegmented: derivedSources('get_claims', { documentReference: reference, unsegmentedText: 'All claims' }).map(source => [source.anchor, source.retrieval]),
      emptyAbstract: derivedSources('get_abstract', { documentReference: reference }),
      unknownTool: derivedSources('get_fulltext', { documentReference: reference }),
    }).toEqual({
      notRecord: [],
      noReference: [],
      noClaims: [],
      partial: ['EP1:claims:1', 'EP1:claims'],
      unsegmented: [['EP1:claims', 'unsegmented']],
      emptyAbstract: [],
      unknownTool: [],
    })
  })

  it('keeps the structured sources that are records and match their reference, with or without text and language', () => {
    const sources = structuredSources({
      sources: [
        'not a record',
        { anchor: 'EP1:claims', reference, retrieval: 'unsegmented' },
        { anchor: 'EP1:claims:fr', reference, language: 'fr', text: 'Revendications', retrieval: 'returned' },
      ],
    })
    expect(sources?.map(source => [source.anchor, source.retrieval, source.text])).toEqual([['EP1:claims', 'unsegmented', undefined], ['EP1:claims:fr', 'returned', 'Revendications']])
  })

  it('lists the documents of a search page by id, skipping entries without one', () => {
    expect(recordOf('search_patents', { query: 'hinge' }, { docs: ['EP1', { docId: 'EP2' }, { title: 'no id' }, 3] })?.publicationIds).toEqual(['EP1', 'EP2'])
  })

  it('adds no anchor labels for a text result whose sources hold no text', () => {
    expect(anchorLabels('get_bibliography', success({ documentReference: { ...reference, section: 'bibliography' } }))).toBeUndefined()
  })
})

describe('the recorder on the registry', () => {
  async function registry(ledger: PatentLedger) {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    const warnings: string[] = []
    ctx.logger.exporter({ levels: { default: 3 }, export(message) {
      if (message.type === 'warn') warnings.push(message.args.map(String).join(' '))
    } })
    registerRecorder(ctx, ledger)
    ctx.tools.register({
      name: 'get_claims',
      description: 'fake',
      parameters: { type: 'object', properties: {} },
      output: { schema: {}, render: () => [{ type: 'text', text: 'claims' }] },
      execute: () => Promise.resolve({ documentReference: reference, claims: [{ documentReference: { ...reference, claimNumber: '1' }, text: 'A hinge.' }] }),
    })
    const agent = { id: 'session-1', session: { id: 'session-1' } } as never
    const call = (withAgent: boolean) => executeModelToolFixture(ctx, {
      callId: ToolCallId('c1'), name: 'get_claims', arguments: {}, signal: new AbortController().signal, ...withAgent ? { agent } : {},
    })
    return { ctx, warnings, call }
  }

  it('records nothing for a call without an agent, and logs a record that fails', async () => {
    const ledger = new PatentLedger()
    const { warnings, call } = await registry(ledger)
    await call(false)
    const before = (await ledger.read('session-1')).executions.length
    ledger.record = () => Promise.reject(new Error('ledger closed'))
    await call(true)
    await Promise.resolve()
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a rejection that is not an Error is the case under test
    ledger.record = () => Promise.reject('ledger string')
    await call(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect({ before, warnings }).toEqual({
      before: 0,
      warnings: ['flowleap-deliverables: ledger record for get_claims failed: ledger closed', 'flowleap-deliverables: ledger record for get_claims failed: ledger string'],
    })
  })

  it('leaves a result another listener replaced without anchor labels', async () => {
    const { ctx, call } = await registry(new PatentLedger())
    ctx.on('tools/post-execute', () => Promise.resolve({ kind: 'accept', value: 'replaced' }))
    const result = await call(true)
    expect(result.content).toEqual([{ type: 'text', text: 'claims' }])
  })
})

const source = (extra: Record<string, unknown> = {}) => ({ anchor: 'EP1:claims', reference, retrieval: 'returned', review: 'unknown', completeness: 'unknown', ...extra })

describe('the untrusted-storage readers', () => {
  it('reads a source only when every field is usable and the anchor matches', () => {
    const figure = { anchor: 'EP1:figure:2', reference, figure: { page: 2, file: 'drawings/p2.png' }, retrieval: 'returned', review: 'unknown', completeness: 'unknown' }
    const rejected = [
      null, 'text', source({ reference: 'none' }), source({ text: 3 }), source({ language: 4 }), source({ figure: { page: 0 } }), source({ figure: 'page 1' }),
      source({ figure: { page: 1.5 } }), source({ textSource: 'official' }), source({ textSource: 'web' }), source({ textSource: 'web', url: ' ' }),
      source({ anchor: 'EP1:other' }), source({ review: 'read' }), source({ completeness: 'complete' }), source({ retrieval: 'cached' }),
    ].map(readEvidenceSource)
    expect({
      rejected: rejected.every(entry => entry === undefined),
      plain: readEvidenceSource(source({ figure: null, textSource: null })),
      web: readEvidenceSource(source({ textSource: 'web', url: 'https://example.com/a', text: 'Claim text' })),
      figure: readEvidenceSource(figure)?.figure,
      bareFigure: readEvidenceSource({ ...figure, figure: { page: 2, file: ' ' } })?.figure,
    }).toEqual({
      rejected: true,
      plain: { anchor: 'EP1:claims', reference, text: undefined, language: undefined, figure: undefined, retrieval: 'returned', review: 'unknown', completeness: 'unknown' },
      web: { anchor: 'EP1:claims', text: 'Claim text', reference, language: undefined, figure: undefined, textSource: 'web', url: 'https://example.com/a', retrieval: 'returned', review: 'unknown', completeness: 'unknown' },
      figure: { page: 2, file: 'drawings/p2.png' },
      bareFigure: { page: 2 },
    })
  })

  it('recovers a record field by field, dropping each unusable value and keeping JSON nulls as absent', () => {
    const recovered = readPatentExecution({
      kind: 'search', status: 'cancelled', query: 7, total: -1, returned: Number.POSITIVE_INFINITY, countryFilter: ['EP', 3], publicationIds: 'EP1',
      range: { begin: 1, end: 'x' }, sources: [source(), { anchor: 'bad' }], unavailableSections: null, tool: 'not_a_tool', rowCount: '3',
    })
    const save = readPatentExecution({ id: 'a', recordedAt: 't', kind: 'save', status: 'failed', tool: 'write_patent_results', range: { begin: 1, end: 4 }, sources: [], total: 5 })
    const wrongSave = readPatentExecution({ kind: 'save', status: 'succeeded', tool: 'get_claims', sources: 'none', range: 5, openPoints: ['rung-1'] })
    expect({
      invalid: [readPatentExecution(null), readPatentExecution({ kind: 'other', status: 'succeeded' }), readPatentExecution({ kind: 'search', status: 'done' }), readPatentExecution({ kind: 'search' })],
      recovered: recovered && {
        dropped: recovered.dropped, id: recovered.execution.id, status: recovered.execution.status,
        countryFilter: recovered.execution.countryFilter, sources: recovered.execution.sources?.length, tool: recovered.execution.tool,
      },
      save: save && [save.dropped, save.execution.status, save.execution.tool, save.execution.range, save.execution.total],
      wrongSave: wrongSave && [wrongSave.dropped, wrongSave.execution.tool, wrongSave.execution.sources, wrongSave.execution.openPoints],
    }).toEqual({
      invalid: [undefined, undefined, undefined, undefined],
      recovered: { dropped: true, id: '', status: 'cancelled', countryFilter: ['EP'], sources: 1, tool: undefined },
      save: [false, 'failed', 'write_patent_results', { begin: 1, end: 4 }, 5],
      wrongSave: [true, undefined, undefined, ['rung-1']],
    })
  })

  it('prefers official text over a web source at one anchor, names a web page by its host, and anchors a figure page', () => {
    const official = source({ text: 'Official.' }) as PatentEvidenceSource
    const web = source({ text: 'Web copy.', textSource: 'web', url: 'https://x.test' }) as PatentEvidenceSource
    const bare = source() as PatentEvidenceSource
    expect({
      officialFirst: evidenceSourceIndex([official, web]).get('EP1:claims')?.text,
      webFirst: evidenceSourceIndex([web, official]).get('EP1:claims')?.text,
      noText: evidenceSourceIndex([bare, web]).get('EP1:claims')?.text,
      twoWeb: evidenceSourceIndex([web, { ...web, text: 'Second web.' }]).get('EP1:claims')?.text,
      hosts: [webPageHost('https://Example.COM/page'), webPageHost('not a url'), webPageHost(undefined), webPageHost('data:text/plain,x')],
      figure: figureAnchor('EP1', 3),
    }).toEqual({
      officialFirst: 'Official.',
      webFirst: 'Official.',
      noText: 'Web copy.',
      twoWeb: 'Second web.',
      hosts: ['example.com', 'web', 'web', 'web'],
      figure: 'EP1:figure:3',
    })
  })
})

describe('the ledger store', () => {
  async function domain(pool: MemoryMediaPool) {
    const ctx = new Context()
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    return facility.open(ledgerDomainSpec)
  }

  it('discloses a stored record recovered with dropped fields, and keeps a record that lands while the stored ones load', async () => {
    const pool = new MemoryMediaPool()
    const first = await domain(pool)
    await first.table('sessions').put('s', { executions: [{ id: 'old', recordedAt: '2026-10-23T09:00:00.000Z', kind: 'search', status: 'succeeded', total: 'many' }] })
    await first.close()
    const ledger = new PatentLedger(() => new Date('2026-10-23T10:00:00.000Z'))
    ledger.attach(ledgerPersistence(await domain(pool)))
    await Promise.all([
      ledger.record('s', { kind: 'search', status: 'succeeded', query: 'a' }),
      ledger.record('s', { kind: 'search', status: 'succeeded', query: 'b' }),
    ])
    const snapshot = await ledger.read('s')
    expect({
      ids: snapshot.executions.map(execution => execution.query ?? execution.id),
      partial: snapshot.limitation.startsWith('Some audit records were recovered with unreadable fields dropped; those fields are unknown, not zero. '),
    // Both records carry one time stamp, so they keep the order they reached the list: the second skipped the load.
    }).toEqual({ ids: ['old', 'b', 'a'], partial: true })
  })

  it('discloses records that could not be stored', async () => {
    const opened = await domain(new MemoryMediaPool())
    const ledger = new PatentLedger()
    ledger.attach(ledgerPersistence(opened))
    await ledger.read('s')
    await opened.close()
    await ledger.record('s', { kind: 'search', status: 'succeeded', query: 'a' })
    const snapshot = await ledger.read('s')
    expect([snapshot.executions.length, snapshot.limitation.startsWith('Some audit records are unreadable or incomplete. ')]).toEqual([1, true])
  })
})
