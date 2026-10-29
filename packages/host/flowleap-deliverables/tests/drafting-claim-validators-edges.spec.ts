/** Claim rules that the IDE-ported claim-validators spec does not exercise. */

import { describe, expect, it } from 'vitest'
import { checkAntecedentBasis, checkClaimNumbering, claimTermKey, independentRoots, introducedPhrases } from '../src/drafting/claim-validators.ts'
import { parseClaims } from '../src/drafting/claims.ts'

const messages = (findings: readonly { readonly message: string }[]) => findings.map(finding => finding.message)

describe('Application Drafting claim rules edges', () => {
  it('reports a first claim that is not claim 1', () => {
    expect(messages(checkClaimNumbering(parseClaims('2. A hinge.\n3. A door.')))).toEqual([
      'Claim 2 is the first claim; claims must be numbered 1 to 2 without gaps.',
      'Claim 3 follows claim 2; claims must be numbered 1 to 2 without gaps.',
    ])
  })

  it('ends a term at a long -ed participle and keeps short and -eed words in it', () => {
    const claims = parseClaims('1. A device comprising a rod coated pin, a pin bed rod and a pin freed rod, wherein the rod is hot, the pin bed rod is flat, the pin freed rod is loose and the arm is cold.')
    expect(messages(checkAntecedentBasis(claims))).toEqual([
      'Claim 1: "the arm" has no antecedent basis ("an arm") earlier in claim 1 or in the claims it depends on.',
    ])
  })

  it('reads no term from a text with no words and no phrase after an introducer that a number follows', () => {
    expect([claimTermKey('12'), introducedPhrases('a 5 mm rod')]).toEqual(['', []])
  })

  it('lists each independent claim that a claim depends on, in number order', () => {
    const claims = parseClaims('1. A hinge.\n2. A door.\n3. The hinge of claim 2 or 1, wherein it is steel.')
    expect(independentRoots(claims[2], new Map(claims.map(claim => [claim.number, claim])))).toEqual([1, 2])
  })
})
