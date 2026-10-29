/**
 * The native `compare_claims` tool over the real connector library with a
 * recorded text router: the IDE's name and schema, the missing-key answer, the
 * element-by-element chart on one and on two patents (the IDE's compare cases),
 * a US number answered with the paid-route text through the REAL router (no US
 * source on this host, no network), the all-failed answer, and the input guards.
 */

import { Context } from '@deepseek-ai/cordis'
import type { ContentBlock, ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { ErrorCodes, createConnectors, type Connectors, type ProviderReadResult, type RoutedClaims } from '@flowleap/connectors'
import { describe, expect, it, vi } from 'vitest'
import {
  COMPARE_CLAIMS_MAX_PATENTS, COMPARE_CLAIMS_NAME, COMPARE_CLAIMS_TEXT_BUDGET, createConnectorHost, createCredentialStore, decomposeClaim,
  formatComparisonPackage, registerCompareClaimsTool, selectIndependentClaim,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { MemoryCredentials } from './memory-credentials.ts'

/** The IDE's analysis rubric, with the full-description pointer resolved to this host's tool. */
const ANALYSIS_INSTRUCTIONS = [
  '---',
  '### Analysis Instructions',
  'The chart above is a positional decomposition scaffold; confirm the actual element correspondence against the full claim text, then perform an element-by-element comparison of the user claim against each prior-art claim set. For each patent, report:',
  '1. **Relevance** — HIGH (anticipates most/all elements), MEDIUM (discloses several elements), or LOW.',
  '2. **Overlapping elements** — user-claim elements disclosed by the prior art, citing the specific claim number.',
  '3. **Missing elements** — user-claim elements NOT found in the prior art (potential novelty).',
  '4. **Key differences** — material differences in scope or implementation.',
  '',
  'Then summarize: HIGH-relevance patents raise §102 (anticipation) risk; combinations of MEDIUM-relevance patents may support §103 (obviousness) rejections. Use get_description for full descriptions of specific patents if needed.',
]

/** The paid-route text the real router gives a US number on a host without a US full-text source. */
const US_PAID_ROUTE = 'This host has no US full-text source. US claims for US7654321B2 are a paid FlowLeap service: '
  + 'call mcp__flowleap__get_claims with this number.'

/** Claims by compact docId, as the text router would return them for EP publications. */
type Recorded = Record<string, string[] | ProviderReadResult<RoutedClaims> | Error>

async function bench(recorded: Recorded = {}) {
  const ctx = new Context()
  const credentials = new MemoryCredentials(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  const store = createCredentialStore(credentials)
  const fetchSpy = vi.fn<typeof fetch>(() => Promise.reject(new Error('no network in this spec')))
  const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10, fetch: fetchSpy })
  const real = createConnectors(bound.host)
  const routed: { docId: string; language: string }[] = []
  // The recorded router: a recorded number answers from the record; any other number takes the REAL router.
  const connectors: Connectors = {
    ...real,
    fulltext: {
      ...real.fulltext,
      getClaimsRouted: (docId: string, language = 'en') => {
        routed.push({ docId, language })
        const entry = recorded[docId]
        if (entry === undefined) return real.fulltext.getClaimsRouted(docId, language)
        if (entry instanceof Error) return Promise.reject(entry)
        if (!Array.isArray(entry)) return Promise.resolve(entry)
        return Promise.resolve({
          ok: true as const,
          cached: false,
          data: { docId, lang: 'en', claims: entry, numberedClaims: entry.map((text, index) => ({ number: String(index + 1), text })) },
        })
      },
    },
  }
  registerCompareClaimsTool(ctx, connectors, bound)
  let calls = 0
  const call = (args: unknown, signal = new AbortController().signal) => executeModelToolFixture(ctx, {
    callId: `call-${String(++calls)}` as ToolCallId, name: COMPARE_CLAIMS_NAME, arguments: args, signal,
  })
  return { ctx, store, fetchSpy, routed, call }
}

/** The text of a model-facing content block, or the block's type when it carries no text. */
function textOf(block: ContentBlock | undefined): string {
  return block?.type === 'text' ? block.text : String(block?.type)
}

describe('compare_claims', () => {
  it('registers under the IDE\'s name with the IDE\'s input schema', async () => {
    const { ctx } = await bench()
    const [schema] = ctx.tools.schemas()
    expect(schema?.name).toBe('compare_claims')
    expect(schema?.parameters).toEqual({
      type: 'object',
      properties: {
        userClaim: { type: 'string', description: 'The user\'s patent claim or invention description to compare' },
        patentNumbers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of patent publication numbers to compare against (e.g., [\'US-7654321-B2\', \'EP-1234567-A1\'])',
        },
      },
      required: ['userClaim', 'patentNumbers'],
    })
    expect(schema?.description).toContain('search_patents')
  })

  it('answers without an EPO OPS key with the text that names the EPO OPS card, touching neither the router nor the network', async () => {
    const { fetchSpy, routed, call } = await bench({ EP1000000A1: ['1. A battery pack comprising a housing.'] })
    const result = await call({ userClaim: 'A modular battery.', patentNumbers: ['EP-1000000-A1'] })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      error: 'missing_credentials',
      connector: 'epo-ops',
      message: 'EPO OPS key not configured. Add it in Settings > Patent data connectors > EPO OPS, then call this tool again.',
    })
    expect(result.content).toEqual([{ type: 'text', text: 'EPO OPS key not configured. Add it in Settings > Patent data connectors > EPO OPS, then call this tool again.' }])
    expect(routed).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches the claims through the text router per patent and renders an element-by-element claim chart', async () => {
    const { store, routed, call } = await bench({
      EP7654321B2: ['1. A photovoltaic module comprising a rigid substrate and a light-absorbing layer.'],
    })
    await store.write('epo-ops', { consumerKey: 'ck', consumerSecret: 'cs' })

    const result = await call({ userClaim: 'A flexible photovoltaic device.', patentNumbers: ['EP-7654321-B2'] })

    expect(routed).toEqual([{ docId: 'EP7654321B2', language: 'en' }])
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ patents: [{ patentNumber: 'EP-7654321-B2', claimCount: 1 }] })
    expect(textOf(result.content[0])).toBe([
      '## Prior Art Claim Comparison Package',
      '',
      '### User Claim',
      '```',
      'A flexible photovoltaic device.',
      '```',
      '',
      '### Element-by-Element Claim Chart',
      'Rows are the elements of the reference patent (EP-7654321-B2); `—` means that patent\'s independent claim has no element at that position. Correspondence is positional — verify it against the full claim text below.',
      '',
      '| Claim Element | EP-7654321-B2 |',
      '| --- | --- |',
      '| Preamble | A photovoltaic module comprising |',
      '| Element 1 | a rigid substrate and a light-absorbing layer |',
      '',
      '### Full Claim Text',
      '',
      '#### EP-7654321-B2',
      '```',
      '1. A photovoltaic module comprising a rigid substrate and a light-absorbing layer.',
      '```',
      '',
      ...ANALYSIS_INSTRUCTIONS,
    ].join('\n'))
  })

  it('charts elements across multiple patents, aligning columns positionally and skipping dependent claims', async () => {
    // Two patents, each an independent multi-limitation claim, plus a dependent claim that must be
    // skipped in favour of the independent one. The reference (first) patent has three elements; the
    // second has two, so the third row's second column falls back to "—".
    const { store, call } = await bench({
      EP1000000A1: [
        '1. A battery pack comprising: a housing; a plurality of cells arranged within the housing; and a controller coupled to the cells.',
        '2. The battery pack of claim 1, wherein the controller balances the cells.',
      ],
      EP2000000A1: [
        '1. An energy storage device comprising a casing and a set of cells disposed inside the casing.',
      ],
    })
    await store.write('epo-ops', { consumerKey: 'ck', consumerSecret: 'cs' })

    const result = await call({ userClaim: 'A modular battery.', patentNumbers: ['EP-1000000-A1', 'EP-2000000-A1'] })

    expect(result.isError).toBe(false)
    expect(textOf(result.content[0])).toBe([
      '## Prior Art Claim Comparison Package',
      '',
      '### User Claim',
      '```',
      'A modular battery.',
      '```',
      '',
      '### Element-by-Element Claim Chart',
      'Rows are the elements of the reference patent (EP-1000000-A1); `—` means that patent\'s independent claim has no element at that position. Correspondence is positional — verify it against the full claim text below.',
      '',
      '| Claim Element | EP-1000000-A1 | EP-2000000-A1 |',
      '| --- | --- | --- |',
      '| Preamble | A battery pack comprising | An energy storage device comprising |',
      '| Element 1 | a housing | a casing and a set of cells disposed inside the casing |',
      '| Element 2 | a plurality of cells arranged within the housing | — |',
      '| Element 3 | a controller coupled to the cells | — |',
      '',
      '### Full Claim Text',
      '',
      '#### EP-1000000-A1',
      '```',
      '1. A battery pack comprising: a housing; a plurality of cells arranged within the housing; and a controller coupled to the cells.',
      '',
      '2. The battery pack of claim 1, wherein the controller balances the cells.',
      '```',
      '',
      '#### EP-2000000-A1',
      '```',
      '1. An energy storage device comprising a casing and a set of cells disposed inside the casing.',
      '```',
      '',
      ...ANALYSIS_INSTRUCTIONS,
    ].join('\n'))
  })

  it('answers a US number with the paid-route text from the real router, inline beside an EP patent and alone, without the network', async () => {
    const { store, fetchSpy, call } = await bench({
      EP1000000A1: ['1. A battery pack comprising: a housing; and a controller.'],
    })
    await store.write('epo-ops', { consumerKey: 'ck', consumerSecret: 'cs' })

    const mixed = await call({ userClaim: 'A modular battery.', patentNumbers: ['EP-1000000-A1', 'US-7654321-B2'] })
    expect(mixed.isError).toBe(false)
    expect(mixed.value).toMatchObject({
      patents: [
        { patentNumber: 'EP-1000000-A1', claimCount: 1 },
        { patentNumber: 'US-7654321-B2', claimCount: 0, failureReason: `404 - ${US_PAID_ROUTE}` },
      ],
    })
    const text = textOf(mixed.content[0])
    expect(text).toContain('| Claim Element | EP-1000000-A1 |\n| --- |')
    expect(text).toContain(`#### US-7654321-B2\nClaims unavailable (404 - ${US_PAID_ROUTE}).`)

    const alone = await call({ userClaim: 'A modular battery.', patentNumbers: ['US-7654321-B2'] })
    expect(alone.isError).toBe(false)
    expect(textOf(alone.content[0])).toBe(
      `Could not retrieve claims for any of the requested patents:\n- US-7654321-B2: 404 - ${US_PAID_ROUTE}\n\n`
      + 'Claims are not published for every office and document. Fetch them with get_claims, then compare manually.',
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('folds a key EPO rejects into the replace-the-key answer, caps the comparison at ten patents, and rejects empty input', async () => {
    const rejected: ProviderReadResult<RoutedClaims> = {
      ok: false, status: 401, headers: {},
      body: { success: false, status: 401, error: { code: ErrorCodes.patent_provider_key_invalid, message: 'EPO refused the key' } },
    }
    const { store, routed, call } = await bench({ EP1000000A1: rejected, EP2000000A1: ['1. A device comprising a part.'] })
    await store.write('epo-ops', { consumerKey: 'stale', consumerSecret: 'cs' })

    const refused = await call({ userClaim: 'A device.', patentNumbers: ['EP-1000000-A1', 'EP-2000000-A1'] })
    expect(refused.isError).toBe(false)
    expect(refused.value).toMatchObject({ error: 'missing_credentials', connector: 'epo-ops' })
    expect(textOf(refused.content[0])).toBe('EPO OPS rejected the stored key. Replace it in Settings > Patent data connectors > EPO OPS.')

    routed.splice(0)
    const many = Array.from({ length: COMPARE_CLAIMS_MAX_PATENTS + 2 }, () => 'EP-2000000-A1')
    const capped = await call({ userClaim: 'A device.', patentNumbers: many })
    expect(capped.isError).toBe(false)
    expect(routed).toHaveLength(COMPARE_CLAIMS_MAX_PATENTS)
    expect((capped.value as { patents: unknown[] }).patents).toHaveLength(COMPARE_CLAIMS_MAX_PATENTS)

    const noClaim = await call({ userClaim: '   ', patentNumbers: ['EP-2000000-A1'] })
    expect(noClaim.isError).toBe(true)
    expect(textOf(noClaim.content[0])).toContain('no user claim provided')
    const noNumbers = await call({ userClaim: 'A device.', patentNumbers: [] })
    expect(noNumbers.isError).toBe(true)
    expect(textOf(noNumbers.content[0])).toContain('no patent numbers provided')
  })

  it('decomposes a claim deterministically: preamble at the transition, limitations on semicolons, labels and conjunctions stripped', () => {
    expect(decomposeClaim('1. A method of charging a battery, comprising: (a) measuring a voltage; (b) comparing the voltage to a threshold; (c) stopping the charge when the threshold is reached.')).toEqual([
      { label: 'Preamble', text: 'A method of charging a battery, comprising', type: 'preamble' },
      { label: 'Element 1', text: 'measuring a voltage', type: 'limitation' },
      { label: 'Element 2', text: 'comparing the voltage to a threshold', type: 'limitation' },
      { label: 'Element 3', text: 'stopping the charge when the threshold is reached', type: 'limitation' },
    ])
    expect(decomposeClaim('A widget.')).toEqual([{ label: 'Element 1', text: 'A widget', type: 'limitation' }])
    expect(decomposeClaim('  ')).toEqual([])
  })

  it.each([
    ['a value that is not an object', ['EP-1'], 'invalid arguments: expected an object'],
    ['a userClaim that is not a string', { userClaim: 7, patentNumbers: ['EP-1'] }, 'invalid arguments: userClaim must be a string'],
    ['patentNumbers that are not strings', { userClaim: 'A device.', patentNumbers: [1] }, 'invalid arguments: patentNumbers must be an array of strings'],
  ])('refuses %s', async (_case, args, message) => {
    const { routed, call } = await bench()
    const result = await call(args)
    expect(result.isError).toBe(true)
    expect(textOf(result.content[0])).toContain(`compare_claims: ${message}`)
    expect(routed).toEqual([])
  })

  it('answers a router refusal for want of a data key with the EPO OPS missing-key text', async () => {
    const required: ProviderReadResult<RoutedClaims> = {
      ok: false, status: 403, headers: {},
      body: { success: false, status: 403, error: { code: ErrorCodes.data_keys_required, message: 'keys required' } },
    }
    const { store, call } = await bench({ EP1000000A1: required })
    await store.write('epo-ops', { consumerKey: 'ck', consumerSecret: 'cs' })
    const result = await call({ userClaim: 'A device.', patentNumbers: ['EP-1000000-A1'] })
    expect(result.isError).toBe(false)
    expect(textOf(result.content[0])).toBe('EPO OPS key not configured. Add it in Settings > Patent data connectors > EPO OPS, then call this tool again.')
  })

  it('reads unnumbered claims, reports an empty claim set as no claims returned, and fails on a router error', async () => {
    const { store, call } = await bench({
      EP1000000A1: { ok: true, cached: false, data: { docId: 'EP1000000A1', lang: 'en', claims: ['A device comprising a part.'] } },
      EP2000000A1: { ok: true, cached: false, data: { docId: 'EP2000000A1', lang: 'en', claims: [] } },
      EP3000000A1: new Error('router offline'),
    })
    await store.write('epo-ops', { consumerKey: 'ck', consumerSecret: 'cs' })
    const result = await call({ userClaim: 'A device.', patentNumbers: ['EP-1000000-A1', 'EP-2000000-A1'] })
    expect(result.value).toMatchObject({
      patents: [
        { patentNumber: 'EP-1000000-A1', claimCount: 1 },
        { patentNumber: 'EP-2000000-A1', claimCount: 0, failureReason: 'no claims returned' },
      ],
    })
    const text = textOf(result.content[0])
    expect(text).toContain('| Claim Element | EP-1000000-A1 |\n| --- | --- |\n| Preamble | A device comprising |')
    expect(text).toContain('#### EP-2000000-A1\nClaims unavailable (no claims returned).')

    const failed = await call({ userClaim: 'A device.', patentNumbers: ['EP-3000000-A1'] })
    expect(failed.isError).toBe(true)
    expect(textOf(failed.content[0])).toContain('router offline')
  })

  it('elides long chart cells, cuts an oversized claim, drops the claims past the text budget with a notice, and charts the first claim when all depend', async () => {
    const longElement = `a ${'very '.repeat(40)}long housing`
    const oversized = `1. A device comprising ${'x'.repeat(COMPARE_CLAIMS_TEXT_BUDGET)}.`
    const filler = (n: number) => `${String(n)}. The device of claim 1, wherein ${'y'.repeat(COMPARE_CLAIMS_TEXT_BUDGET / 2)}.`
    const { store, call } = await bench({
      EP1000000A1: [`1. A battery comprising ${longElement}; and a lid.`, filler(2), filler(3), filler(4)],
      EP2000000A1: [oversized],
      EP3000000A1: ['1. The device of claim 2, wherein it is red.', '2. The device of claim 1, wherein it is blue.'],
    })
    await store.write('epo-ops', { consumerKey: 'ck', consumerSecret: 'cs' })
    const result = await call({ userClaim: 'A battery.', patentNumbers: ['EP-1000000-A1', 'EP-2000000-A1', 'EP-3000000-A1'] })
    const text = textOf(result.content[0])
    expect(text).toContain(`| Element 1 | ${longElement.slice(0, 120)}… |`)
    expect(text).toContain(`\`\`\`\n${oversized.slice(0, COMPARE_CLAIMS_TEXT_BUDGET)}…\n\`\`\``)
    expect(text).toContain(`> Response exceeded this tool's ${String(COMPARE_CLAIMS_TEXT_BUDGET)}-character budget. 2 result item(s) were omitted`)
    expect(text).toContain('| Claim Element | EP-1000000-A1 | EP-2000000-A1 | EP-3000000-A1 |')
    expect(text).toContain('| Preamble | A battery comprising | A device comprising | The device of claim 2, wherein it is red |')
  })

  it('selects and decomposes edge-case claims and renders a package without any fetched claims', () => {
    expect(selectIndependentClaim([])).toBe('')
    expect(decomposeClaim('2. ;')).toEqual([{ label: 'Element 1', text: ';', type: 'limitation' }])
    const markdown = formatComparisonPackage('A device.', [{ patentNumber: 'US-1', claims: null, failureReason: '404 - not found' }])
    expect(markdown).not.toContain('Claim Chart')
    expect(markdown).toContain('#### US-1\nClaims unavailable (404 - not found).')
  })
})
