/**
 * The second read as the judge model and the report see it: the prompt text
 * for each kind of element, the passage window when the cited fragment is
 * line-wrapped or absent, the verdict parser on replies without JSON, and
 * the Limitations line and unconfirmed list for each outcome.
 */

import { describe, expect, it } from 'vitest'
import {
  buildSecondReadRequests, notJudgedFigureElements, parseSecondReadVerdicts, PASSAGE_WINDOW, secondReadLimitation, secondReadPrompt,
  summarizeSecondRead, unconfirmedVerdicts,
} from '../src/report/second-read.ts'

/** The passage the request gives the judge for one element cited from `text`. */
function passage(text: string, disclosedBy: string | undefined): string | undefined {
  const [request] = buildSecondReadRequests(
    { coverage: [{ feature: 'Cam', status: 'supported', elements: [{ element: 'cam', anchor: 'EP1:description:en', ...(disclosedBy === undefined ? {} : { disclosedBy }) }] }] },
    { executions: [{}, { sources: [{ anchor: 'EP1:description:en', text }] }] },
  )
  return request?.elements[0]?.passage
}

describe('second read passage window', () => {
  const fragment = 'the cam profile carried on the stem'
  const long = `${'a '.repeat(4000)}the cam profile\ncarried   on the stem${' b'.repeat(200)}`

  it('finds a line-wrapped fragment and keeps it inside the window', () => {
    const window = passage(long, fragment) ?? ''
    expect({ length: window.length, wrapped: window.includes('the cam profile\ncarried   on the stem') }).toEqual({ length: PASSAGE_WINDOW, wrapped: true })
  })

  it('shows the start of the text when no fragment is cited or the fragment is not in the text', () => {
    const start = long.slice(0, PASSAGE_WINDOW)
    expect([passage(long, undefined), passage(long, '   '), passage(long, 'a gear train')]).toEqual([start, start, start])
  })
})

describe('second read requests', () => {
  it('builds no request and counts no figure element for a review without coverage or element map', () => {
    expect({
      requests: buildSecondReadRequests({}, { executions: [] }),
      notJudged: [notJudgedFigureElements({}), notJudgedFigureElements({ coverage: [{ feature: 'Cam', status: 'supported' }] })],
    }).toEqual({ requests: [], notJudged: [0, 0] })
  })
})

describe('second read prompt', () => {
  it('prints the passage, the cited fragment, or the reason no passage is printed for each element', () => {
    const prompt = secondReadPrompt({
      feature: 'Cam pair',
      status: 'partial',
      elements: [
        { element: 'a rotary cam', anchor: 'EP1:claims:1:en', disclosedBy: 'a rotary cam', passage: 'A device comprising a rotary cam.' },
        { element: 'a lever', passage: 'A lever fixed to the cam.' },
        { element: 'a spring', disclosedBy: 'a spring' },
        { element: 'a stem', anchor: 'EP9:claims:1:en' },
        { element: 'a head' },
      ],
    })
    expect(prompt.slice(prompt.indexOf('FEATURE: '))).toBe([
      'FEATURE: Cam pair',
      'STATUS CLAIMED BY THE REPORT: partial',
      '',
      'ELEMENT 1: a rotary cam',
      'CITED FRAGMENT: a rotary cam',
      'SOURCE PASSAGE (EP1:claims:1:en):',
      '"""',
      'A device comprising a rotary cam.',
      '"""',
      '',
      'ELEMENT 2: a lever',
      'SOURCE PASSAGE (unnamed source):',
      '"""',
      'A lever fixed to the cam.',
      '"""',
      '',
      'ELEMENT 3: a spring',
      'CITED FRAGMENT: a spring',
      'SOURCE PASSAGE (unnamed source): NOT AVAILABLE — the recorded text for this source was not kept.',
      '',
      'ELEMENT 4: a stem',
      'CITED FRAGMENT: (none)',
      'SOURCE PASSAGE (EP9:claims:1:en): NOT AVAILABLE — the recorded text for this source was not kept.',
      '',
      'ELEMENT 5: a head',
      'NO PASSAGE CITED — the report states this element is not disclosed by the cited text.',
      '',
    ].join('\n'))
  })
})

describe('second read verdicts and outcome', () => {
  it('returns undefined for a reply without a JSON object or with a value that is not an object', () => {
    expect(['no verdicts here', '} {', '{"verdicts": [}', '{"verdicts":[null]}', '{"verdicts":[3]}'].map(parseSecondReadVerdicts))
      .toEqual([undefined, undefined, undefined, undefined, undefined])
  })

  it('lists the elements the judge did not confirm, and states a judged, skipped or not-run second read', () => {
    const rows = [
      { feature: 'Cam', status: 'supported', verdicts: [{ element: 'cam', verdict: 'agree', reason: 'Recited.' }, { element: 'stem', verdict: 'unclear', reason: 'Cut off.' }] },
      { feature: 'Lever', status: 'partial', unparsed: 'prose' },
    ] as const
    expect({
      unconfirmed: unconfirmedVerdicts(rows),
      summary: summarizeSecondRead(rows),
      judged: secondReadLimitation({ kind: 'judged', model: 'judge-model', rows, summary: summarizeSecondRead(rows) }),
      skipped: secondReadLimitation({ kind: 'skipped', reason: 'no rows claim disclosure' }),
      notRun: secondReadLimitation({ kind: 'notRun', reason: 'judge unreachable' }),
    }).toEqual({
      unconfirmed: [{ feature: 'Cam', element: 'stem', verdict: 'unclear', reason: 'Cut off.' }],
      summary: { elements: 2, agree: 1, disagree: 0, unclear: 1, unparsed: 1 },
      judged: 'Second read by judge-model: 2 elements judged, 0 not confirmed, 1 unclear, 1 unparsed.',
      skipped: 'Second read: skipped (no rows claim disclosure).',
      notRun: 'Second read: not run (judge unreachable).',
    })
  })
})
