/**
 * The find-better-report save of `write_patent_results`, ported from the IDE's
 * `writePatentResultsTool.spec.ts` "find-better report save path" cases: the
 * claim tables of the examiner's best art beside the best art found, the
 * Examiner Baseline matrix and its gaps, the refusals of a bad
 * `examinerBestArt` or Baseline, ignored model scores, the Tracks log matched
 * against the execution record, an incomplete search, and P/E or late art.
 * The ledger is filled directly, so the report reads the same record every case.
 */

import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { provideWorkingDirectoryFixture, unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type {} from '@deepseek-ai/dsh-tool-present/types'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ConfirmedMarkets, NO_LLM_JUDGE, PatentLedger, PresentQueue, registerDeliverableTools, registerPresent, writePatentResultsTool,
  type NewPatentExecution,
} from '../src/index.ts'
import { FakeSeams, textOf } from './gates-test-bench.ts'

const dirs: string[] = []
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

let sessions = 0

/** A writer over a temp directory whose ledger holds `executions` for the Session. */
async function bench(executions: readonly NewPatentExecution[]) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-find-better-')))
  dirs.push(dir)
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SessionStore)
  provideWorkingDirectoryFixture(ctx, dir)
  const seams = new FakeSeams()
  const present = new PresentQueue()
  const ledger = new PatentLedger(seams.now)
  const log = { warn: () => {}, info: () => {} }
  registerPresent(ctx, present, () => 1)
  registerDeliverableTools(ctx, [writePatentResultsTool(ctx, {
    ledger, judge: () => NO_LLM_JUDGE, present, gates: seams, markets: new ConfirmedMarkets(), secondRead: () => 'off', now: seams.now, ...log,
  })])
  const session = ctx.sessions.create(SessionId(`find-better-${String(++sessions)}`), { meta: { cwd: dir } })
  for (const execution of executions) await ledger.record(session.id, execution)
  const agent: Agent = {
    id: session.id, options: {}, session, model: unsupportedModel(), inbox: unsupportedInbox(), status: 'idle', ctx,
    send: () => {}, followup: () => {}, steer: () => {}, inject: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal), whenIdle: () => Promise.resolve(),
  }
  /** Save `value`, with `onDisk` written first; the result text and the report, empty when none was written. */
  const save = async (value: object, onDisk?: { path: string; text: string }) => {
    if (onDisk) {
      await mkdir(dirname(join(dir, onDisk.path)), { recursive: true })
      await writeFile(join(dir, onDisk.path), onDisk.text)
    }
    const result = await executeModelToolFixture(ctx, {
      callId: ToolCallId(`call-${String(++sessions)}`), name: 'write_patent_results', arguments: value, signal: new AbortController().signal, agent,
    })
    const report = await readFile(join(dir, 'outputs/find-better.md'), 'utf8').catch(() => '')
    const record = await readFile(join(dir, 'outputs/find-better.working-record.md'), 'utf8').catch(() => '')
    return { message: textOf(result.content[0]), report, record }
  }
  return { save }
}

// The target is EP2000000B1, claim 1: a skewer rod (a) and a cam surface on the head (b). The
// examiner's best art is US5135330A (X in both offices); the tracks found DE1000000A and DE2000000A.
const examinerClaim = '1. A fastener comprising a skewer rod and a lever arm.'
const betterClaim = '1. A quick release comprising a skewer rod and a cam surface formed on the head portion.'
const weakerClaim = '1. A clamp comprising a skewer rod and a cam surface.'
const examinerArt = 'US5135330A:claims:1:en'
const better = 'DE1000000A:claims:1:en'
const weaker = 'DE2000000A:claims:1:en'
const source = (anchor: string, publicationNumber: string, text: string) => ({
  anchor, text, reference: { publicationNumber, section: 'claims' as const, claimNumber: '1' }, language: 'en',
  retrieval: 'returned' as const, review: 'unknown' as const, completeness: 'unknown' as const,
})
const EXECUTIONS: NewPatentExecution[] = [
  { kind: 'search', status: 'succeeded', query: 'cpc=F16B2/18 and ta=skewer', effectiveQuery: 'cpc=F16B2/18 and ta=skewer', total: 14, returned: 14, countryFilter: [] },
  {
    kind: 'details', status: 'succeeded', publicationIds: ['US5135330A', 'DE1000000A', 'DE2000000A'],
    sources: [source(examinerArt, 'US5135330A', examinerClaim), source(better, 'DE1000000A', betterClaim), source(weaker, 'DE2000000A', weakerClaim)],
  },
  { kind: 'figures', status: 'failed', publicationIds: ['DE1000000A'] },
]
const review = (anchor: string) => ({ anchor, scope: 'Independent claim 1 as quoted.', qualifiers: 'Structural recitation only.', quantityBasis: 'Structural claim language; no numeric range.' })
const baseline = {
  publication: 'EP2000000B1',
  offices: ['EP', 'US'],
  membersWalked: [
    { office: 'EP', representativePublication: 'EP2000000B1', docdbApplication: null, publications: [{ publication: 'EP2000000A3', status: 'read', citedCount: 1, examinerCount: 1, applicantCount: 0 }] },
    { office: 'US', representativePublication: 'US7000000B2', docdbApplication: null, publications: [{ publication: 'US7000000B2', status: 'read', citedCount: 1, examinerCount: 0, applicantCount: 1 }] },
  ],
  documents: [
    {
      document: 'US5135330', kinds: ['A'], familyId: null, cells: {
        EP: { text: 'X,A cl. 1-5', citations: [{ source: 'ops_biblio', citing: 'EP2000000A3', citedBy: 'examiner', category: 'X,A', relevantClaims: '1-5' }] },
        US: { text: 'X cl. 1-4 (US OA 2009-08-18)', citations: [{ source: 'uspto_enriched', citing: '12103744', citedBy: 'examiner', category: 'X', relevantClaims: '1-4' }] },
      },
    },
    { document: 'US4000000', kinds: ['A'], familyId: null, cells: { US: { text: 'applicant', citations: [{ source: 'ops_biblio', citing: 'US7000000B2', citedBy: 'applicant' }] } } },
  ],
  gaps: [] as object[],
  dedupe: 'docdb-number',
}
const unresolved = (gap: string) => ({ status: 'unresolved' as const, sourceAnchors: [], gap })
const supported = (anchor: string, element: string, fragment: string) => ({
  status: 'supported' as const, sourceAnchors: [anchor], evidence: [review(anchor)], elements: [{ element, anchor, disclosedBy: fragment }], gap: '',
})
const unused = { status: 'unresolved' as const, sourceAnchors: [], gap: '' }
const tracks = [
  {
    name: 'Backward citations, two hops from X/Y', queries: [
      { query: 'citations of US5135330', tool: 'search_citations', count: 1, hop: 1 },
      { query: 'citations of US3000000', tool: 'search_citations', count: 0, hop: 2 },
    ],
  },
  { name: 'Classification co-occurrence', queries: [{ query: 'cpc=F16B2/18 and ta=skewer', tool: 'search_patents', count: 99 }] },
  { name: 'Inventor and NPL-author network', queries: [{ query: 'in="MUELLER HANS" and pd<20040301', tool: 'search_patents', count: 0 }] },
]

/** A Find Better save of claim 1 whose found side is `foundB` on element (b) and `foundWhole` on the combination. */
const input = (foundB: object, foundWhole: object, extra: object = {}) => ({
  filePath: 'outputs/find-better.md', template: 'find-better-report', content: '',
  challengedPublication: 'EP2000000B1', subject: 'Quick release skewer', objective: 'Earliest priority date 2004-03-01 (EP2000000 priority claim).',
  baseline,
  examinerBestArt: [{ claimNumber: '1', publications: ['US5135330A'] }],
  tracks,
  coverage: [
    {
      feature: 'Claim 1 — element (a): a skewer rod', claimNumber: '1', kind: 'feature', importance: 'essential', ...unused,
      examiner: supported(examinerArt, 'a skewer rod', 'a skewer rod'), found: supported(better, 'a skewer rod', 'a skewer rod'),
    },
    {
      feature: 'Claim 1 — element (b): a cam surface on the head', claimNumber: '1', kind: 'feature', importance: 'essential', ...unused,
      examiner: unresolved('The examiner\'s art has a lever arm and no cam surface.'), found: foundB,
    },
    {
      feature: 'Claim 1 as a whole', claimNumber: '1', kind: 'combination', importance: 'essential', ...unused,
      examiner: unresolved('No cam surface on the head in the examiner\'s art.'), found: foundWhole,
    },
  ] as object[],
  limitations: ['Synthetic fixture; eligibility of each reference requires review.'], stopReason: 'All three tracks run.',
  ...extra,
})
const betterB = {
  status: 'supported', sourceAnchors: [better], evidence: [review(better)], gap: '',
  elements: [{ element: 'a cam surface', anchor: better, disclosedBy: 'a cam surface' }, { element: 'formed on the head portion', anchor: better, disclosedBy: 'formed on the head portion' }],
}
const betterWhole = {
  status: 'supported', sourceAnchors: [better], evidence: [review(better)], gap: '',
  elements: [{ element: 'a skewer rod', anchor: better, disclosedBy: 'a skewer rod' }, { element: 'a cam surface on the head portion', anchor: better, disclosedBy: 'a cam surface formed on the head portion' }],
}
const betterInput = input(betterB, betterWhole)
const weakerInput = input(
  {
    status: 'partial', sourceAnchors: [weaker], evidence: [review(weaker)], gap: 'DE2000000A does not place the cam surface on the head.',
    elements: [{ element: 'a cam surface', anchor: weaker, disclosedBy: 'a cam surface' }, { element: 'formed on the head portion' }],
  },
  {
    status: 'partial', sourceAnchors: [weaker], evidence: [review(weaker)], gap: 'The cam surface is not on the head.',
    elements: [{ element: 'a skewer rod', anchor: weaker, disclosedBy: 'a skewer rod' }, { element: 'a cam surface on the head portion' }],
  },
)
// Element (a)'s found side cites the weaker document in the nothing-better case.
weakerInput.coverage[0] = { ...weakerInput.coverage[0], found: supported(weaker, 'a skewer rod', 'a skewer rod') }

/** The lines of `report` from the heading `from` up to, not including, the next heading at that level or above. */
function section(report: string, from: string): string[] {
  const lines = report.split('\n')
  const start = lines.indexOf(from)
  const level = /^#+/.exec(from)?.[0].length ?? 0
  const end = lines.findIndex((line, index) => index > start && /^#+ /.test(line) && (/^#+/.exec(line)?.[0].length ?? 0) <= level)
  return lines.slice(start, end < 0 ? undefined : end).filter(line => line.trim())
}

describe('find-better report save path', () => {
  it('(a) renders the examiner\'s best art beside better art found on claim 1, counted from validated rows', async () => {
    const { report, message } = await (await bench(EXECUTIONS)).save(betterInput)
    expect({
      header: report.split('\n').slice(0, 9),
      claim: section(report, '### Claim 1').slice(0, 9),
      tracks: section(report, '## Tracks log'),
      contract: message.split('\n').find(line => line.startsWith('Chat summary contract: ')),
    }).toEqual({
      header: [
        '# Find Better Report',
        '',
        '| Field | Details |',
        '| --- | --- |',
        '| Target patent | EP2000000B1 |',
        '| Independent claim(s) compared | 1 |',
        '| Earliest priority date basis | Earliest priority date 2004-03-01 (EP2000000 priority claim). |',
        '| Date | 2026-10-23 |',
        '| Prepared by | FlowLeap Patent AI (AI-assisted draft) |',
      ],
      claim: [
        '### Claim 1',
        '| Element | Examiner\'s best art (US5135330A) | Best art found (DE1000000A) |',
        '| --- | --- | --- |',
        '| Claim 1 — element (a): a skewer rod | disclosed | disclosed |',
        '| Claim 1 — element (b): a cam surface on the head | not found | disclosed |',
        '| Claim 1 as a whole (combination, not counted) | not found | disclosed |',
        'examiner\'s best art: disclosed 1 of 2 · best art found: disclosed 2 of 2',
        'For claim 1, the best art found (DE1000000A) discloses 2 of 2 elements; the examiner\'s best art US5135330A discloses 1 of 2.',
        '#### Claim 1 — element (a): a skewer rod — examiner\'s best art',
      ],
      tracks: [
        '## Tracks log',
        'Every expansion track of this run with each query it ran and its hit count, including queries that returned nothing. A track with no query was not searched.',
        '| Track | Query | Tool | Hits | Count basis |',
        '| --- | --- | --- | --- | --- |',
        '| Backward citations, two hops from X/Y (hop 1) | citations of US5135330 | search_citations | 1 | as reported by the agent; not in the execution record |',
        '| Backward citations, two hops from X/Y (hop 2) | citations of US3000000 | search_citations | 0 | as reported by the agent; not in the execution record |',
        '| Classification co-occurrence | cpc=F16B2/18 and ta=skewer | search_patents | 14 | execution record |',
        '| Inventor and NPL-author network | in="MUELLER HANS" and pd<20040301 | search_patents | 0 | as reported by the agent; not in the execution record |',
      ],
      contract: 'Chat summary contract: repeat each cell\'s status word exactly (disclosed / partially disclosed / not found); state each claim\'s counts exactly as the saved report counts them (claim 1 — examiner\'s best art: disclosed 1 of 2 · best art found: disclosed 2 of 2); state that the Baseline has 0 gaps in the offices\' records and that a gap is not "nothing cited"; where no better art was found, say so as a complete result. Do not add invalidity, anticipation or obviousness conclusions. The summary must not be more certain than the saved report.',
    })
  })

  it('(b) renders "no better art found" as a complete result with the full Baseline', async () => {
    const { report, message } = await (await bench(EXECUTIONS)).save(weakerInput)
    expect({
      saved: message.split('\n')[0],
      claim: section(report, '### Claim 1').slice(0, 9),
      baseline: section(report, '## Examiner Baseline').filter(line => !line.startsWith('Every document the examining offices cited')),
    }).toEqual({
      saved: 'Successfully wrote patent results to outputs/find-better.md',
      claim: [
        '### Claim 1',
        '| Element | Examiner\'s best art (US5135330A) | Best art found (DE2000000A) |',
        '| --- | --- | --- |',
        '| Claim 1 — element (a): a skewer rod | disclosed | disclosed |',
        '| Claim 1 — element (b): a cam surface on the head | not found | partially disclosed |',
        '| Claim 1 as a whole (combination, not counted) | not found | partially disclosed |',
        'examiner\'s best art: disclosed 1 of 2 · best art found: disclosed 1 of 2',
        'No better art found for claim 1; the examiner\'s best art remains US5135330A (disclosed 1 of 2).',
        '#### Claim 1 — element (a): a skewer rod — examiner\'s best art',
      ],
      baseline: [
        '## Examiner Baseline',
        'Family members walked: 2. Offices: EP, US.',
        '| Office | Member | Read | Cited (examiner / applicant) |',
        '| --- | --- | --- | --- |',
        '| EP | EP2000000B1 | EP2000000A3: read | 1 (1 / 0) |',
        '| US | US7000000B2 | US7000000B2: read | 1 (0 / 1) |',
        'Cited documents: 2.',
        '| Document | EP | US |',
        '| --- | --- | --- |',
        '| US5135330 A (examiner\'s best art, claim 1) | X,A cl. 1-5 (claims of EP2000000A3) | X cl. 1-4 (US OA 2009-08-18) (claims of 12103744) |',
        '| US4000000 A | - | applicant |',
        '### Gaps in the offices\' records',
        'A gap is a member or source that returned no citation record. It is not "nothing cited": that office\'s citations for that member are unknown.',
        '- The Baseline reports no gaps.',
      ],
    })
  })

  it('(c) renders an office with no citation record as a gap, never as "nothing cited"', async () => {
    const withGap = input(betterB, betterWhole, {
      baseline: { ...baseline, offices: ['EP', 'US', 'KR'], gaps: [{ office: 'KR', member: 'KR20150058102A', source: 'ops_biblio', reason: 'no_citation_record', message: 'no citation record from KR (KR20150058102A)' }] },
    })
    const { report, message } = await (await bench(EXECUTIONS)).save(withGap)
    expect({
      matrixHeader: report.split('\n').find(line => line.startsWith('| Document |')),
      gaps: section(report, '### Gaps in the offices\' records'),
      contract: message.includes('the Baseline has 1 gap in the offices\' records'),
    }).toEqual({
      matrixHeader: '| Document | EP | US | KR |',
      gaps: [
        '### Gaps in the offices\' records',
        'A gap is a member or source that returned no citation record. It is not "nothing cited": that office\'s citations for that member are unknown.',
        '- Gap: no citation record from KR (KR20150058102A) (no_citation_record)',
      ],
      contract: true,
    })
  })

  it('(d) refuses examinerBestArt that names a document absent from the Baseline, or one with no X or Y category', async () => {
    const { save } = await bench(EXECUTIONS)
    const absent = await save(input(betterB, betterWhole, { examinerBestArt: [{ claimNumber: '1', publications: ['EP9999999A1'] }] }))
    const applicantOnly = await save(input(betterB, betterWhole, { examinerBestArt: [{ claimNumber: '1', publications: ['US4000000A'] }] }))
    const missing = await save({ filePath: 'outputs/find-better.md', template: 'find-better-report', content: '' })
    expect({
      absent: absent.message.split('\n').filter(line => line.includes('examinerBestArt')),
      applicantOnly: applicantOnly.message.split('\n').filter(line => line.includes('examinerBestArt')),
      missing: missing.message,
      written: absent.report || applicantOnly.report || missing.report,
    }).toEqual({
      absent: [
        '- examinerBestArt for claim 1 names EP9999999A1, which is not in baseline.documents[]. The examiner\'s best art must be a document the Baseline lists; pick one of its X or Y citations, or, where none exists, an examiner-cited document.',
        '- Row "Claim 1 — element (a): a skewer rod" cites US5135330A:claims:1:en (US5135330A) on the examiner side, but the examiner\'s best art for claim 1 is EP9999999A1. Cite that art on the examiner side, or name US5135330A in examinerBestArt if the Baseline supports it.',
      ],
      applicantOnly: [
        '- examinerBestArt for claim 1 names US4000000A, which only the applicant cited: the Baseline gives it no category, no examiner citation and no US office-action rejection. The examiner\'s best art must be an X or Y citation, or, where none exists, a document an examiner cited or a US office action rejected claims with.',
        '- Row "Claim 1 — element (a): a skewer rod" cites US5135330A:claims:1:en (US5135330A) on the examiner side, but the examiner\'s best art for claim 1 is US4000000A. Cite that art on the examiner side, or name US5135330A in examinerBestArt if the Baseline supports it.',
      ],
      missing: 'Report was not saved. find-better-report is a structured save and needs coverage (element rows, each with an examiner side and a found side); baseline or baselinePath (the Examiner Baseline JSON inline, or the workspace path of the --json output of flowleap patent examiner-baseline); examinerBestArt (per independent claim, the X or Y citation of the Baseline picked as the examiner\'s best art); tracks (every expansion track with its queries and hit counts, empty ones included). Leave content empty.',
      written: '',
    })
  })

  it('(e) ignores a model-supplied score, names it in the result, keeps it off the page, and flags invalidity wording', async () => {
    const scored = input(betterB, betterWhole, { stopReason: 'DE1000000A anticipates claim 1, which is invalid and obvious.' })
    const coverage = scored.coverage.map(row => ({ ...row, found: { ...(row as { found: object }).found, score: 0.92 } }))
    const withScore = { ...scored, coverage, findBetterScore: 87 }
    const { report, message } = await (await bench(EXECUTIONS)).save(withScore)
    expect({
      ignored: message.split('\n').find(line => line.startsWith('Ignored model-supplied numeric field(s): ')),
      onPage: /0\.92|\b87\b/.test(report),
      counted: report.includes('examiner\'s best art: disclosed 1 of 2 · best art found: disclosed 2 of 2'),
      wording: message.split('\n').find(line => line.startsWith('Wording review: ')),
    }).toEqual({
      ignored: 'Ignored model-supplied numeric field(s): coverage[0].found.score, coverage[1].found.score, coverage[2].found.score, findBetterScore. A Find Better report counts disclosed elements from the validated rows only; no model-supplied number reaches the report.',
      onPage: false,
      counted: true,
      wording: 'Wording review: 3 phrase(s) flagged in the working record; reword them in a follow-up save if they are conclusions rather than disclaimers.',
    })
  })

  it('(f) reads the Baseline from baselinePath, states its source, and refuses both or an unreadable file', async () => {
    const { save } = await bench(EXECUTIONS)
    const { baseline: _inline, ...byPath } = { ...betterInput, baselinePath: 'references/baseline.json' }
    const fromFile = await save(byPath, { path: 'references/baseline.json', text: JSON.stringify(baseline) })
    const fromFileReport = fromFile.report
    const inline = await save(betterInput)
    const both = await save({ ...betterInput, baselinePath: 'references/baseline.json' })
    const unreadable = await save(byPath, { path: 'references/baseline.json', text: 'Examiner Baseline: EP2000000B1' })
    expect({
      source: fromFile.message.split('\n').find(line => line.startsWith('Examiner Baseline source: ')),
      inlineSource: inline.message.split('\n').find(line => line.startsWith('Examiner Baseline source: ')),
      recordSource: fromFile.record.split('\n').find(line => line.startsWith('Examiner Baseline source: ')),
      sameReport: fromFileReport === inline.report,
      both: both.message,
      unreadable: unreadable.message.startsWith('Report was not saved. baselinePath "references/baseline.json" could not be read as JSON'),
    }).toEqual({
      source: 'Examiner Baseline source: file references/baseline.json.',
      inlineSource: 'Examiner Baseline source: inline.',
      recordSource: 'Examiner Baseline source: file references/baseline.json. The writer checked its shape, its X/Y categories and that documents[] holds every citation membersWalked counts, not that the offices\' records say what it says.',
      sameReport: true,
      both: 'Report was not saved. find-better-report takes exactly one of baseline and baselinePath. Give the inline Baseline or the path to the CLI\'s --json output, not both.',
      unreadable: true,
    })
  })

  it('(g) refuses a truncated Baseline or one missing rows its own counts imply, and notes when nothing could be checked (#526)', async () => {
    const { save } = await bench(EXECUTIONS)
    const { baseline: _inline, ...byPath } = { ...betterInput, baselinePath: 'references/EP2000000B1.examiner-baseline.json' }
    const truncated = await save(byPath, {
      path: 'references/EP2000000B1.examiner-baseline.json',
      text: JSON.stringify({
        ...baseline, documents: baseline.documents.slice(0, 1), _truncation: { truncated: true, omittedItems: 1, retainedItems: 1 },
      }),
    })
    const stripped = await save(input(betterB, betterWhole, { baseline: { ...baseline, documents: baseline.documents.slice(0, 1) } }))
    const uncounted = await save(input(betterB, betterWhole, { baseline: { ...baseline, membersWalked: [] } }))
    expect({
      truncated: truncated.message,
      stripped: stripped.message,
      written: truncated.report || stripped.report,
      uncounted: uncounted.message.split('\n').find(line => line.startsWith('Examiner Baseline source: ')),
    }).toEqual({
      truncated: 'Candidate draft was not saved. Correct these issues and retry with the revised content:\n- The Examiner Baseline carries _truncation: a tool cut it at its character budget and omitted 1 item(s). A truncated Baseline is not the Baseline, and the report would state fewer cited documents than the offices cited. Re-run the examiner_baseline tool (it writes the full JSON to references/EP2000000B1.examiner-baseline.json), or the CLI (flowleap --json patent examiner-baseline EP2000000B1 > references/EP2000000B1.examiner-baseline.json), and pass that file unedited as baselinePath.',
      stripped: 'Candidate draft was not saved. Correct these issues and retry with the revised content:\n- The Examiner Baseline is incomplete: membersWalked counts more citations than documents[] holds (US7000000B2 (US) cited 1, documents[] holds 0 citation(s) from it, 1 missing). A Baseline cut by a character budget or edited by hand loses rows this way. Re-run the examiner_baseline tool (it writes the full JSON to references/EP2000000B1.examiner-baseline.json), or the CLI (flowleap --json patent examiner-baseline EP2000000B1 > references/EP2000000B1.examiner-baseline.json), and pass that file unedited as baselinePath.',
      written: '',
      uncounted: 'Examiner Baseline source: inline. Baseline completeness not checked: membersWalked reports no read publication with a citedCount, so the writer could not compare documents[] with the offices\' own counts.',
    })
  })

  it('(h) says "Search incomplete" instead of "No better art found" when a track ran no query or Track 1 has no hop 2 (#529)', async () => {
    const incomplete = [
      { name: 'Backward citations, two hops from X/Y', queries: [{ query: 'citations of US5135330', tool: 'search_citations', count: 1, hop: 1 }] },
      { name: 'Classification co-occurrence', queries: [{ query: 'cpc=F16B2/18 and ta=skewer', tool: 'search_patents', count: 99 }] },
      { name: 'Inventor and NPL-author network', queries: [] },
    ]
    const { report, message } = await (await bench(EXECUTIONS)).save({ ...weakerInput, tracks: incomplete })
    expect({
      saved: message.split('\n')[0],
      result: section(report, '### Claim 1')[7],
      contract: message.split('\n').find(line => line.startsWith('Chat summary contract: '))?.split('; ').slice(3).join('; '),
    }).toEqual({
      saved: 'Successfully wrote patent results to outputs/find-better.md',
      result: 'Search incomplete for claim 1: track Inventor and NPL-author network ran no query; Track 1 has no second-hop entry. The queries that ran found no better art; the examiner\'s best art remains US5135330A (disclosed 1 of 2).',
      contract: 'state that the search is incomplete (track Inventor and NPL-author network ran no query; Track 1 has no second-hop entry) and do not present "no better art found" as a complete result. Do not add invalidity, anticipation or obviousness conclusions. The summary must not be more certain than the saved report.',
    })
  })

  it('(i) names only the examiner\'s best art an examiner-side row cites, and lists the rest as named but not scored (#529)', async () => {
    const unscoredArt = {
      document: 'US6000000', kinds: ['A'], familyId: null,
      cells: { EP: { text: 'Y cl. 1', citations: [{ source: 'ops_biblio', citing: 'EP2000000A3', citedBy: 'examiner', category: 'Y', relevantClaims: '1' }] } },
    }
    const { report } = await (await bench(EXECUTIONS)).save({
      ...weakerInput, baseline: { ...baseline, documents: [...baseline.documents, unscoredArt] }, examinerBestArt: [{ claimNumber: '1', publications: ['US5135330A', 'US6000000A'] }],
    })
    expect(section(report, '### Claim 1').slice(0, 9)).toEqual([
      '### Claim 1',
      '| Element | Examiner\'s best art (US5135330A) | Best art found (DE2000000A) |',
      '| --- | --- | --- |',
      '| Claim 1 — element (a): a skewer rod | disclosed | disclosed |',
      '| Claim 1 — element (b): a cam surface on the head | not found | partially disclosed |',
      '| Claim 1 as a whole (combination, not counted) | not found | partially disclosed |',
      'examiner\'s best art: disclosed 1 of 2 · best art found: disclosed 1 of 2',
      'No better art found for claim 1; the examiner\'s best art remains US5135330A (disclosed 1 of 2).',
      'Examiner\'s best art named but not scored: US6000000A.',
    ])
  })

  it('(j) flags examiner\'s art with a P or E category, or published after the critical date in objective (#529)', async () => {
    const { save } = await bench(EXECUTIONS)
    const withCategory = (category: string, publicationDate?: string) => ({
      ...baseline, documents: [{
        ...baseline.documents[0], cells: {
          ...baseline.documents[0]?.cells,
          EP: { text: `${category} cl. 1-5`, citations: [{ source: 'ops_biblio', citing: 'EP2000000A3', citedBy: 'examiner', category, relevantClaims: '1-5', ...(publicationDate ? { publicationDate } : {}) }] },
        },
      }, baseline.documents[1]],
    })
    const result = async (value: object) => section((await save({ ...weakerInput, ...value })).report, '### Claim 1')[7]
    expect({
      intermediate: await result({ baseline: withCategory('X,P') }),
      later: await result({ baseline: withCategory('X', '20050115') }),
      earlier: await result({ baseline: withCategory('X', '1992-08-04') }),
    }).toEqual({
      intermediate: 'No better art found for claim 1; the examiner\'s best art remains US5135330A (published after the critical date; not prior art for this claim unless the priority claim fails) (disclosed 1 of 2).',
      later: 'No better art found for claim 1; the examiner\'s best art remains US5135330A (published after the critical date; not prior art for this claim unless the priority claim fails) (disclosed 1 of 2).',
      earlier: 'No better art found for claim 1; the examiner\'s best art remains US5135330A (disclosed 1 of 2).',
    })
  })

  it('(l) matches a logged query with a trailing note to the execution record, and names a document once whatever its kind code (#537)', async () => {
    // The same DE1000000 claim recorded once with its kind code and once without it.
    const bare = 'DE1000000:claims:1:en'
    const twoSpellings: NewPatentExecution[] = [...EXECUTIONS, { kind: 'details', status: 'succeeded', publicationIds: ['DE1000000'], sources: [source(bare, 'DE1000000', betterClaim)] }]
    const noted = {
      ...betterInput,
      examinerBestArt: [{ claimNumber: '1', publications: ['US5135330A', 'US5135330'] }],
      tracks: [
        tracks[0],
        {
          name: 'Classification co-occurrence', queries: [
            { query: 'cpc=F16B2/18  and ta=skewer (first call HTTP 503, retried)', tool: 'search_patents', count: 14 },
            { query: 'cpc=F16B2/18 and (ta=skewer)', tool: 'search_patents', count: 3 },
          ],
        },
        tracks[2],
      ],
      coverage: betterInput.coverage.map(row => (row as { kind: string }).kind === 'combination'
        ? { ...row, found: supported(bare, 'a cam surface on the head portion', 'a cam surface formed on the head portion') }
        : row),
    }
    const { report } = await (await bench(twoSpellings)).save(noted)
    const claim = section(report, '### Claim 1')
    expect({
      header: claim[1],
      result: claim[7],
      tracks: section(report, '## Tracks log').filter(line => line.startsWith('| Classification')),
    }).toEqual({
      header: '| Element | Examiner\'s best art (US5135330A) | Best art found (DE1000000A) |',
      result: 'For claim 1, the best art found (DE1000000A) discloses 2 of 2 elements; the examiner\'s best art US5135330A discloses 1 of 2.',
      tracks: [
        '| Classification co-occurrence | cpc=F16B2/18  and ta=skewer (first call HTTP 503, retried) | search_patents | 14 | execution record |',
        '| Classification co-occurrence | cpc=F16B2/18 and (ta=skewer) | search_patents | 3 | as reported by the agent; not in the execution record |',
      ],
    })
  })

  it('(k) saves a US-only Baseline with no categories, taking the examiner-cited document as the examiner\'s best art (#531)', async () => {
    const usOnly = {
      publication: 'US7000000B1',
      offices: ['US'],
      membersWalked: [{
        office: 'US', representativePublication: 'US7000000B1', docdbApplication: null,
        publications: [{ publication: 'US7000000B1', status: 'read', citedCount: 2, examinerCount: 1, applicantCount: 1 }],
        usptoEnriched: { applicationNumber: '10100378', status: 'no_citation_record', rows: 0, total: null, unidentifiedRows: 0 },
      }],
      documents: [
        { document: 'US5135330', kinds: ['A'], familyId: null, cells: { US: { text: 'examiner', citations: [{ source: 'ops_biblio', citing: 'US7000000B1', citedBy: 'examiner' }] } } },
        { document: 'US4000000', kinds: ['A'], familyId: null, cells: { US: { text: 'applicant', citations: [{ source: 'ops_biblio', citing: 'US7000000B1', citedBy: 'applicant' }] } } },
      ],
      gaps: [{ office: 'US', member: 'US7000000B1', source: 'uspto_enriched', reason: 'no_citation_record', message: 'no USPTO enriched-citation record for US7000000B1 (application 10100378)' }],
      dedupe: 'docdb-number',
    }
    const { report, message } = await (await bench(EXECUTIONS)).save({ ...weakerInput, challengedPublication: 'US7000000B1', baseline: usOnly })
    expect({
      saved: message.split('\n')[0],
      claim: section(report, '### Claim 1').slice(0, 8),
    }).toEqual({
      saved: 'Successfully wrote patent results to outputs/find-better.md',
      claim: [
        '### Claim 1',
        '| Element | Examiner\'s best art (US5135330A (examiner-cited, no category)) | Best art found (DE2000000A) |',
        '| --- | --- | --- |',
        '| Claim 1 — element (a): a skewer rod | disclosed | disclosed |',
        '| Claim 1 — element (b): a cam surface on the head | not found | partially disclosed |',
        '| Claim 1 as a whole (combination, not counted) | not found | partially disclosed |',
        'examiner\'s best art: disclosed 1 of 2 · best art found: disclosed 1 of 2',
        'No better art found for claim 1; the examiner\'s best art remains US5135330A (disclosed 1 of 2).',
      ],
    })
  })
})
