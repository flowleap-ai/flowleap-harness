/**
 * The slash commands, the strict gate path (the IDE's `draftingGateContribution.spec.ts` over a
 * command registry instead of a window): `/confirm-features` and `/approve-claims` write the
 * flag, read it back, record `(command /<name>)` and rewrite `checklist.md` at once;
 * `/waive <matter> <rule or line> <reason>` writes one reason under each item of the rule or
 * the line; a bad line, a missing file or an unknown rule writes nothing and says so.
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { DraftFinding } from '../src/drafting/finding.ts'
import { renderFindingsFile } from '../src/drafting/findings-file.ts'
import { emptyWorkingRecord, setRecordField, VALIDATED_DRAFT_HASH, VERSION_CLAIMS_HASH } from '../src/drafting/working-record.ts'
import { sha256Hex } from '../src/report/text.ts'
import { claims, claimsHashOf, stable } from './drafting-matter-fixtures.ts'
import { benchWith, type FakeCommands } from './gates-test-bench.ts'

const benches: { dispose: () => Promise<void> }[] = []
afterEach(async () => {
  for (const bench of benches.splice(0)) await bench.dispose()
})

const draft = '---\noffice: US\nmodel: claude-sonnet-5\nprovider: anthropic\n---\n# Hinge\n\n## DETAILED DESCRIPTION\n\n<!-- src: feature:F1 -->\nThe housing 12 holds the lever 14.\n'
const errors: DraftFinding[] = [
  { severity: 'Error', rule: 'antecedent-basis', file: 'claims.md', line: 4, claim: 2, message: 'Claim 2: "the clamp body" has no antecedent basis.' },
  { severity: 'Error', rule: 'antecedent-basis', file: 'claims.md', line: 5, claim: 3, message: 'Claim 3: "the pin" has no antecedent basis.' },
  { severity: 'Error', rule: 'defined-term', file: 'draft-application.md', line: 12, message: 'Line 12 writes "clamp-body"; the defined term is "clamp body".' },
]

/** A matter with both gates closed, a draft validated against the current claims, and three open Errors. */
function matterFiles(): Record<string, string> {
  const claimsText = claims('false')
  const versioned = setRecordField(emptyWorkingRecord('hinge'), VERSION_CLAIMS_HASH, claimsHashOf(claimsText))
  const record = setRecordField(versioned, VALIDATED_DRAFT_HASH, sha256Hex(`${draft}\0${claimsHashOf(claimsText)}`))
  return {
    'drafting/hinge/feature-list.md': '---\noffice: US\nconfirmed: false\n---\n| F1 | lever |\n',
    'drafting/hinge/claims.md': claimsText,
    'drafting/hinge/draft-outline.md': `---\noffice: US\nclaims: ${claimsHashOf(claimsText)}\n---\n# Draft Outline\n`,
    'drafting/hinge/draft-application.md': draft,
    'drafting/hinge/draft-application.working-record.md': record,
    'drafting/hinge/findings.md': renderFindingsFile(errors),
  }
}

/** The checklist lines of the steps and the next-step line. */
async function checklistOf(read: (path: string) => Promise<string>): Promise<string[]> {
  return (await read('drafting/hinge/checklist.md')).split('\n').filter(line => /^- \[|^Next step/.test(line))
}

describe('gate commands', () => {
  it('registers the three commands with their hints', async () => {
    const bench = await benchWith(matterFiles())
    benches.push(bench)
    const registered = [...bench.commands.definitions.values()]
    expect(registered.map(definition => [definition.name, definition.input?.hint, /Attorney only/.test(definition.description)])).toEqual([
      ['confirm-features', '<matter>', true],
      ['approve-claims', '<matter>', true],
      ['waive', '<matter> <rule or line> <reason>', true],
    ])
  })

  it('/confirm-features and /approve-claims write the flag, record the command and rewrite checklist.md at once; a second run writes nothing', async () => {
    const bench = await benchWith(matterFiles())
    benches.push(bench)
    const { commands, agent, read } = bench
    const confirmed = await commands.run(agent, '/confirm-features hinge')
    const afterConfirm = await checklistOf(read)
    const approved = await commands.run(agent, '/approve-claims hinge')
    const again = await commands.run(agent, '/approve-claims hinge')
    const record = (await read('drafting/hinge/draft-application.working-record.md')).split('\n').filter(line => /confirmed|approved/.test(line)).map(stable)
    const text = (result: typeof confirmed) => result?.kind === 'success' ? result.text?.split('\nWrote ') : result
    expect({
      confirmed: text(confirmed),
      approved: text(approved),
      again: text(again),
      featureList: await read('drafting/hinge/feature-list.md'),
      claims: (await read('drafting/hinge/claims.md')).split('\n').slice(0, 3).map(stable),
      afterConfirm,
      afterApprove: await checklistOf(read),
      record,
    }).toMatchSnapshot()
  })

  it('/waive by rule writes one reason under each item of the rule, by line under one item; the checklist moves on and the record names the rule', async () => {
    const bench = await benchWith(matterFiles())
    benches.push(bench)
    const { commands, agent, read } = bench
    await commands.run(agent, '/confirm-features hinge')
    await commands.run(agent, '/approve-claims hinge')
    const byRule = await commands.run(agent, '/waive hinge antecedent-basis False positive: "a clamp body" is in claim 1.')
    const afterRule = await checklistOf(read)
    // The two waiver lines moved the defined-term item down: the attorney reads the line from the file as it is now.
    const definedTermLine = (await read('drafting/hinge/findings.md')).split('\n').findIndex(line => line.includes('`defined-term`')) + 1
    const byLine = await commands.run(agent, `/waive hinge ${String(definedTermLine)} Client spelling.`)
    expect({
      byRule: byRule?.kind === 'success' ? byRule.text?.split('\nWrote ')[0] : byRule,
      definedTermLine,
      byLine: byLine?.kind === 'success' ? byLine.text?.split('\nWrote ')[0] : byLine,
      afterRule: afterRule.filter(line => /^- \[.\] 4|^Next/.test(line)),
      afterAll: (await checklistOf(read)).filter(line => /^- \[.\] [46]|^Next/.test(line)),
      findings: await read('drafting/hinge/findings.md'),
      record: (await read('drafting/hinge/draft-application.working-record.md')).split('\n').filter(line => line.includes('Error waived')).map(stable),
    }).toMatchSnapshot()
  })

  it('a bad line, a missing matter or file, an unknown rule and a waived item write nothing and say so', async () => {
    const bench = await benchWith(matterFiles())
    benches.push(bench)
    const { commands, agent, read } = bench
    const before = await read('drafting/hinge/findings.md')
    const results = [
      await commands.run(agent, '/approve-claims'),
      await commands.run(agent, '/approve-claims hinge extra'),
      await commands.run(agent, '/approve-claims ../secrets'),
      await commands.run(agent, '/approve-claims pump'),
      await commands.run(agent, '/waive hinge'),
      await commands.run(agent, '/waive hinge source-marker A reason.'),
      await commands.run(agent, '/waive hinge 3 A reason.'),
      await commands.run(agent, '/waive pump 7 A reason.'),
    ]
    expect({
      results: results.map(result => result?.kind === 'error' ? result.text : result),
      unchanged: await read('drafting/hinge/findings.md') === before,
      claims: (await read('drafting/hinge/claims.md')).split('\n')[1],
    }).toEqual({
      results: [
        'Usage: /approve-claims <matter> (the folder name under drafting/).',
        'Usage: /approve-claims <matter> (the folder name under drafting/).',
        '"../secrets" is not a matter name. Give the folder name under drafting/, e.g. "hinge" for drafting/hinge/.',
        'drafting/pump/claims.md does not exist. Nothing was written.',
        'Usage: /waive <matter> <rule or findings.md line> <reason>.',
        'drafting/hinge/findings.md has no open Error of rule source-marker. Open: line 7 (antecedent-basis), line 8 (antecedent-basis), line 9 (defined-term). Nothing was written.',
        'drafting/hinge/findings.md has no open Error on line 3. Open: line 7 (antecedent-basis), line 8 (antecedent-basis), line 9 (defined-term). Nothing was written.',
        'drafting/pump/findings.md does not exist: run validate_draft first. Nothing was written.',
      ],
      unchanged: true,
      claims: 'approved: false',
    })
  })

  it('an invalid frontmatter block is left alone and named', async () => {
    const bench = await benchWith({ ...matterFiles(), 'drafting/hinge/claims.md': '---\napproved: [\n---\n1. A hinge.\n' })
    benches.push(bench)
    const result = await bench.commands.run(bench.agent, '/approve-claims hinge')
    expect({ result, claims: await bench.read('drafting/hinge/claims.md') }).toEqual({
      result: { kind: 'error', text: 'The block between the `---` lines at the top of drafting/hinge/claims.md is not valid YAML. Correct it by hand, then run the command again. Nothing was written.' },
      claims: '---\napproved: [\n---\n1. A hinge.\n',
    })
  })

  it('disposing the registration removes the three commands', async () => {
    const bench = await benchWith(matterFiles())
    benches.push(bench)
    const registry: FakeCommands = bench.commands
    const before = registry.definitions.size
    bench.disposeCommands()
    expect([before, registry.definitions.size]).toEqual([3, 0])
  })
})
