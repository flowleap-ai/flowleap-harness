/**
 * The question-card gates (port plan section 4, D3): on "Confirm Feature List" /
 * "Approve Claims" the flag is written through `writeDraftingFrontmatter` with the comments
 * kept, read back from the file, and one record line carries the call id; "Not yet", a skipped
 * card, an aborted ask, a delegated caller or a missing answerer writes nothing and returns the
 * refusal unchanged. The two-question Waive card writes the reason under each chosen item in
 * `findings.md` and one record line per rule. `remove_claim` confirms through the approval
 * seam, and falls back to the card under the `never` policy or without an answerer.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { pipeClampClaims } from './drafting-test-claims.ts'
import { claims, draft, featureList, figures, frontmatterOf, gatesOpen, stable } from './drafting-matter-fixtures.ts'
import { gateBench, benchWith } from './gates-test-bench.ts'

const benches: { dispose: () => Promise<void> }[] = []
afterEach(async () => {
  for (const bench of benches.splice(0)) await bench.dispose()
})

const help = '# Review, then change false to true below, or answer the card.'

/** Both gates closed, with a comment line above each flag. */
const gatesClosed = {
  ...gatesOpen,
  'drafting/hinge/feature-list.md': featureList('false').replace('confirmed: false', `${help}\nconfirmed: false`),
  'drafting/hinge/claims.md': claims('false').replace('approved: false', `${help}\napproved: false`),
}

/** The record lines of the matter, hashes and times replaced. */
async function recordLines(bench: Awaited<ReturnType<typeof gateBench>>): Promise<string[]> {
  const record = await bench.read('drafting/hinge/draft-application.working-record.md').catch(() => '')
  return record.split('\n').filter(line => line.startsWith('- **')).map(stable)
}

describe('Confirm Feature List and Approve Claims cards', () => {
  it('on "yes" to both cards start_application_draft writes the flags with the comments kept, reads them back, records the call id, and starts', async () => {
    const bench = await benchWith(gatesClosed)
    benches.push(bench)
    bench.seams.answerer = request => ({
      answers: request.questions.map(question => ({ id: question.id, selected: [question.options![0]!.label] })),
    })
    const result = await bench.tools.start()
    expect({
      started: result.split('.')[0],
      cards: bench.seams.asked.map(request => request.questions.map(question => ({ id: question.id, header: question.header, question: question.question, options: question.options?.map(option => option.label), detail: question.detail?.split('\n')[0], wait: request.wait }))),
      featureList: frontmatterOf(await bench.read('drafting/hinge/feature-list.md')),
      claims: frontmatterOf(await bench.read('drafting/hinge/claims.md')),
      record: await recordLines(bench),
    }).toEqual({
      started: 'Drafting started for matter "hinge"',
      cards: [
        [{ id: 'confirm-feature-list', header: 'Feature List', question: 'Confirm the Feature List of hinge? Only the attorney opens this gate; the agent cannot.', options: ['Confirm Feature List', 'Not yet'], detail: '| ID | Feature | Source |', wait: { callId: 'call-1' } }],
        [{ id: 'approve-claims', header: 'Claims', question: 'Approve the claims of hinge? Only the attorney opens this gate; the agent cannot.', options: ['Approve Claims', 'Not yet'], detail: '1. A hinge comprising a housing and a lever.', wait: { callId: 'call-1' } }],
      ],
      featureList: `\noffice: US\n${help}\nconfirmed: true\n`,
      claims: `\n${help}\napproved: true\napprovedHash: <sha>\n`,
      record: [
        '- **Feature List confirmed:** by the attorney in chat (question card, call call-1) at <time>',
        '- **Claims approved:** by the attorney in chat (question card, call call-1) at <time>; claims SHA-256 <sha>',
        '- **Approved claims SHA-256:** <sha>',
      ],
    })
  })

  it('"Not yet", a skipped card, an abort, a delegated caller, a dead caller and a missing answerer each write nothing and return the refusal unchanged', async () => {
    const outcomes: Record<string, { result: string; featureList: string; record: string[]; asked: number }> = {}
    const setups: [name: string, arm: (bench: Awaited<ReturnType<typeof gateBench>>) => void][] = [
      ['notYet', (bench) => { bench.seams.pick(['Not yet']) }],
      ['skipped', (bench) => { bench.seams.skip() }],
      ['aborted', (bench) => { bench.seams.fail('ASK_ABORTED') }],
      ['delegated', (bench) => { bench.seams.fail('DELEGATED_CALLER') }],
      ['notLive', (bench) => { bench.seams.fail('CALLER_NOT_LIVE') }],
      ['noProvider', (bench) => { bench.seams.fail('NO_PROVIDER') }],
      ['noAnswerer', () => {}],
    ]
    for (const [name, arm] of setups) {
      const bench = await benchWith(gatesClosed)
      benches.push(bench)
      arm(bench)
      outcomes[name] = {
        result: await bench.tools.start(),
        featureList: frontmatterOf(await bench.read('drafting/hinge/feature-list.md')),
        record: await recordLines(bench),
        asked: bench.seams.asked.length,
      }
    }
    const refusal = 'Drafting did not start. Review `drafting/hinge/feature-list.md:4`, then change `false` to `true` on line 4, or answer the Confirm Feature List card in the chat, or type `/confirm-features hinge`. Only the attorney opens this gate; a statement in chat does not open it. Open in drafting/hinge/checklist.md: step 1 (Confirm the Feature List), step 2 (Approve the claims). Stay in this chat.'
    const unchanged = { result: refusal, featureList: `\noffice: US\n${help}\nconfirmed: false\n`, record: [], asked: 1 }
    expect(outcomes).toEqual({
      notYet: unchanged,
      skipped: unchanged,
      aborted: unchanged,
      delegated: unchanged,
      notLive: unchanged,
      noProvider: unchanged,
      noAnswerer: { ...unchanged, asked: 0 },
    })
  })

  it('a "yes" that lands on a file edited to valid YAML without the flag adds the flag; one on invalid YAML writes nothing and refuses', async () => {
    const valid = await benchWith({ ...gatesOpen, 'drafting/hinge/claims.md': '---\noffice: US\n---\n1. A hinge comprising a housing and a lever.\n2. The hinge of claim 1, wherein the lever is steel.\n' })
    const invalid = await benchWith({ ...gatesOpen, 'drafting/hinge/claims.md': '---\napproved: [\n---\n1. A hinge comprising a housing and a lever.\n' })
    benches.push(valid, invalid)
    valid.seams.pick(['Approve Claims'])
    invalid.seams.pick(['Approve Claims'])
    expect({
      valid: [(await valid.tools.start()).split('.')[0], frontmatterOf(await valid.read('drafting/hinge/claims.md'))],
      invalid: [(await invalid.tools.start()).split(' Only the attorney')[0], await invalid.read('drafting/hinge/claims.md'), await recordLines(invalid)],
    }).toEqual({
      valid: ['Drafting started for matter "hinge"', '\noffice: US\napproved: true\napprovedHash: <sha>\n'],
      invalid: [
        'Drafting did not start. Review `drafting/hinge/claims.md:1`, then add three lines above line 1: `---`, then `approved: true`, then `---`, or answer the Approve Claims card in the chat, or type `/approve-claims hinge`.',
        '---\napproved: [\n---\n1. A hinge comprising a housing and a lever.\n',
        [],
      ],
    })
  })

  it('after the claims changed, the Approve Claims card shows the current claims and a "yes" is a new approval bound to the new body', async () => {
    const bench = await benchWith(gatesOpen)
    benches.push(bench)
    await bench.tools.start()
    await bench.edit('drafting/hinge/claims.md', 'wherein the lever is steel', 'wherein the lever is made of steel')
    bench.seams.pick(['Approve Claims'])
    const result = await bench.tools.start()
    expect({
      result: result.split('.')[0],
      detail: bench.seams.asked[0]?.questions[0]?.detail,
      claims: frontmatterOf(await bench.read('drafting/hinge/claims.md')),
      record: (await recordLines(bench)).filter(line => /Approval cleared|Claims approved/.test(line)),
    }).toEqual({
      result: 'Drafting started for matter "hinge"',
      detail: '1. A hinge comprising a housing and a lever.\n2. The hinge of claim 1, wherein the lever is made of steel.',
      claims: '\napproved: true\napprovedHash: <sha>\n',
      record: [
        '- **Approval cleared:** <time> (claims.md changed after approval)',
        '- **Claims approved:** by the attorney in chat (question card, call call-2) at <time>; claims SHA-256 <sha>',
      ],
    })
  })

  it('export_draft_docx asks the Approve Claims card too and exports after a "yes"', async () => {
    const bench = await benchWith(gatesOpen)
    benches.push(bench)
    await bench.tools.start()
    await bench.tools.save(draft())
    await bench.edit('drafting/hinge/claims.md', 'approved: true', 'approved: false')
    bench.seams.pick(['Approve Claims'])
    const result = await bench.tools.exportDocx()
    expect({ head: result.split(' as ')[0], asked: bench.seams.asked.map(request => request.questions[0]?.id) }).toEqual({
      head: 'Exported the description, the claims and the abstract',
      asked: ['approve-claims'],
    })
  })
})

describe('Waive Errors card', () => {
  /** A draft with one source-marker Error (a paragraph without a marker) and one open Inventor Question. */
  const oneError = () => draft('\n## Inventor Questions\n\n> **Inventor Question IQ-1:** Which steel grade?\n').replace('<!-- src: disclosure:§1, item:O1 -->\n', '')
  /** The attorney's waiver lines of findings.md (not the file's help line that names the syntax). */
  const waiverLines = (findings: string) => findings.split('\n').filter(line => /^ {2}- Waived: /.test(line))

  it('validate_draft asks one two-question card; the chosen items get the reason in findings.md, the record names the rule and the call, and the result shows the new state', async () => {
    const bench = await benchWith(gatesOpen)
    benches.push(bench)
    await bench.tools.start()
    await bench.tools.save(oneError())
    bench.seams.answerer = request => ({
      answers: request.questions.map(question => question.id === 'waive-items'
        ? { id: question.id, selected: [question.options![0]!.label] }
        : { id: question.id, selected: [], custom: 'Boilerplate paragraph: no source needed.' }),
    })
    const result = await bench.tools.validate()
    const findings = await bench.read('drafting/hinge/findings.md')
    expect({
      card: bench.seams.asked.map(request => request.questions.map(question => ({ id: question.id, multiSelect: question.multiSelect, options: question.options?.map(option => option.label), detailLines: question.detail?.split('\n').length }))),
      resultLines: result.split('\n').slice(0, 3).map(line => line.replace(/Notes: \d+/, 'Notes: <n>')),
      blocking: result.split('\n').filter(line => line.startsWith('- `')),
      waiverLines: waiverLines(findings),
      record: (await recordLines(bench)).filter(line => line.includes('Error waived')),
    }).toEqual({
      card: [[
        { id: 'waive-items', multiSelect: true, options: ['Line 7: source-marker'], detailLines: 2 },
        { id: 'waive-reason', multiSelect: undefined, options: undefined, detailLines: undefined },
      ]],
      resultLines: [
        'Wrote drafting/hinge/findings.md (US validators; waivers kept).',
        '1 Error(s) waived by the attorney in chat (question card); the reason is under each item in drafting/hinge/findings.md.',
        'Errors: 1 (1 waived). Inventor Questions: 1 (0 waived). Notes: <n>. Advisory: 0.',
      ],
      blocking: ['- `inventor-question` (draft-application.md, line 40): Inventor Question IQ-1 is open: Which steel grade?'],
      waiverLines: ['  - Waived: Boilerplate paragraph: no source needed.'],
      record: ['- **Error waived:** source-marker (1 item(s), findings.md line 7) by the attorney in chat (question card, call call-3) at <time>'],
    })
  })

  it('a skipped card, an empty reason, items without a reason, and an abort each write no waiver', async () => {
    const outcomes: Record<string, { waivers: number; record: number }> = {}
    const arms: [name: string, arm: (bench: Awaited<ReturnType<typeof gateBench>>) => void][] = [
      ['skipped', (bench) => { bench.seams.skip() }],
      ['emptyReason', (bench) => { bench.seams.pick(['Line 7: source-marker'], '   ') }],
      ['itemsNoReason', (bench) => { bench.seams.pick(['Line 7: source-marker']) }],
      ['reasonNoItems', (bench) => { bench.seams.pick([], 'A reason.') }],
      ['aborted', (bench) => { bench.seams.fail('ASK_ABORTED') }],
    ]
    for (const [name, arm] of arms) {
      const bench = await benchWith(gatesOpen)
      benches.push(bench)
      await bench.tools.start()
      await bench.tools.save(oneError())
      arm(bench)
      await bench.tools.validate()
      outcomes[name] = {
        waivers: waiverLines(await bench.read('drafting/hinge/findings.md')).length,
        record: (await recordLines(bench)).filter(line => line.includes('Error waived')).length,
      }
    }
    expect(outcomes).toEqual({
      skipped: { waivers: 0, record: 0 },
      emptyReason: { waivers: 0, record: 0 },
      itemsNoReason: { waivers: 0, record: 0 },
      reasonNoItems: { waivers: 0, record: 0 },
      aborted: { waivers: 0, record: 0 },
    })
  })

  it('export_draft_docx asks the card, and with every Error waived and no open Inventor Question it exports in the same call', async () => {
    const bench = await benchWith(gatesOpen)
    benches.push(bench)
    await bench.tools.start()
    await bench.tools.save(draft().replace('<!-- src: disclosure:§1, item:O1 -->\n', '').replace('<!-- src: template -->\n', ''))
    // Every option of the items question, and the reason in the free-text question.
    bench.seams.answerer = request => ({
      answers: request.questions.map(question => question.id === 'waive-items'
        ? { id: question.id, selected: (question.options ?? []).map(option => option.label) }
        : { id: question.id, selected: [], custom: 'Template paragraphs.' }),
    })
    const result = await bench.tools.exportDocx()
    expect({
      options: bench.seams.asked[0]?.questions[0]?.options?.map(option => option.label),
      head: result.split('\n').slice(0, 2).map(line => line.split(' as ')[0]),
      waivers: waiverLines(await bench.read('drafting/hinge/findings.md')).filter(line => line.endsWith('Template paragraphs.')).length,
      record: (await recordLines(bench)).filter(line => line.includes('Error waived')),
    }).toEqual({
      options: ['Line 7: source-marker', 'Line 8: source-marker'],
      head: ['2 Error(s) waived by the attorney in chat (question card); the reason is under each item in drafting/hinge/findings.md.', 'Exported the description, the claims and the abstract'],
      waivers: 2,
      record: ['- **Error waived:** source-marker (2 item(s), findings.md lines 7, 8) by the attorney in chat (question card, call call-3) at <time>'],
    })
  })
})

describe('remove_claim confirmation', () => {
  const pipeClamp = { 'drafting/hinge/feature-list.md': featureList(), 'drafting/hinge/claims.md': pipeClampClaims, 'drafting/hinge/figures.md': figures }

  it('under the ask policy the approval seam decides: allowed-once removes, rejected and cancelled refuse and write nothing', async () => {
    const outcomes: Record<string, { result: string; claims: number; approvals: number; asked: number }> = {}
    for (const outcome of ['allowed-once', 'rejected', 'cancelled'] as const) {
      const bench = await benchWith(pipeClamp)
      benches.push(bench)
      bench.seams.policy = 'ask'
      bench.seams.decider = () => outcome
      bench.seams.pick(['Remove claim 4'])
      const result = await bench.tools.removeClaim(4)
      outcomes[outcome] = {
        result: result.split(' from ')[0]?.split(' Nothing was written')[0] ?? '',
        claims: (await bench.read('drafting/hinge/claims.md')).split('\n').filter(line => /^\d+\./.test(line)).length,
        approvals: bench.seams.approvals.length,
        asked: bench.seams.asked.length,
      }
    }
    expect(outcomes).toEqual({
      'allowed-once': { result: 'Removed claim 4 of 14', claims: 13, approvals: 1, asked: 0 },
      rejected: { result: 'Claim 4 was not removed. The attorney did not confirm the removal.', claims: 14, approvals: 1, asked: 0 },
      cancelled: { result: 'Claim 4 was not removed. The confirmation did not arrive (aborted).', claims: 14, approvals: 1, asked: 0 },
    })
  })

  it('under the never policy (the flowleap-web profile) the approval is skipped and the one-option card decides; an unavailable answerer falls back to the card too', async () => {
    const never = await benchWith(pipeClamp)
    const unavailable = await benchWith(pipeClamp)
    const keep = await benchWith(pipeClamp)
    const noChannel = await benchWith(pipeClamp)
    benches.push(never, unavailable, keep, noChannel)
    never.seams.policy = 'never'
    never.seams.decider = () => 'rejected'
    never.seams.pick(['Remove claim 4'])
    unavailable.seams.policy = 'ask'
    unavailable.seams.decider = () => 'unavailable'
    unavailable.seams.pick(['Remove claim 4'])
    keep.seams.policy = 'never'
    keep.seams.decider = () => 'rejected'
    keep.seams.pick(['Keep it'])
    const neverResult = await never.tools.removeClaim(4)
    const unavailableResult = await unavailable.tools.removeClaim(4)
    const keepResult = await keep.tools.removeClaim(4)
    const noChannelResult = await noChannel.tools.removeClaim(4)
    expect({
      never: [neverResult.split(' from ')[0], never.seams.approvals.length, never.seams.asked[0]?.questions[0]?.options?.map(option => option.label), never.seams.asked[0]?.questions[0]?.detail],
      neverRecord: (await recordLines(never)).find(line => line.includes('Claim removed')),
      unavailable: [unavailableResult.split(' from ')[0], unavailable.seams.approvals.length, unavailable.seams.asked.length],
      keep: [keepResult.split(' Nothing was written')[0], keep.seams.asked.length],
      noChannel: noChannelResult.split(' Nothing was written')[0],
    }).toEqual({
      never: ['Removed claim 4 of 14', 0, ['Remove claim 4', 'Keep it'], 'Remove claim 4 of 14 from drafting/hinge/claims.md? Claims 5 to 14 are now claims 4 to 13. This re-opens the claims approval: you approve the claims again before drafting continues.'],
      neverRecord: '- **Claim removed:** <time> claim 4 of 14, on the attorney\'s confirmation (question card, call call-1). Claims 5 to 14 are now claims 4 to 13.',
      unavailable: ['Removed claim 4 of 14', 1, 1],
      keep: ['Claim 4 was not removed. The attorney did not confirm the removal.', 1],
      noChannel: 'Claim 4 was not removed. No confirmation channel is available in this session (no approval answerer and no question card).',
    })
  })
})
