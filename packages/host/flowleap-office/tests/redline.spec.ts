/** Claim texts before and after as tracked-change paragraphs. */
import { describe, expect, it } from 'vitest'
import { claimOutcome, joinSegments, redlineParagraph } from '../src/redline.ts'

describe('redlineParagraph', () => {
  it('marks only the words that change in an amended claim, after an unchanged number prefix', () => {
    const paragraph = redlineParagraph({
      number: '1',
      before: 'Wärmeübertrager mit Lamellen, die auf dem Rohr angeordnet sind.',
      after: 'Wärmeübertrager mit Lamellen, die auf dem Rohr angeordnet sind, wobei der Abstand 1,5 mm beträgt.',
    })
    expect(paragraph.mark).toBe('same')
    expect(paragraph.segments).toEqual([
      { kind: 'same', text: '1. Wärmeübertrager mit Lamellen, die auf dem Rohr angeordnet sind' },
      { kind: 'ins', text: ', wobei der Abstand 1,5 mm beträgt' },
      { kind: 'same', text: '.' },
    ])
  })

  it('makes a new claim one inserted paragraph, number included', () => {
    expect(redlineParagraph({ number: '4', after: 'Kühlgerät mit einem Wärmeübertrager nach Anspruch 1.' })).toEqual({
      mark: 'ins', segments: [{ kind: 'ins', text: '4. Kühlgerät mit einem Wärmeübertrager nach Anspruch 1.' }],
    })
  })

  it('makes a deleted claim one deleted paragraph, number included', () => {
    expect(redlineParagraph({ number: '3', before: 'Wärmeübertrager nach Anspruch 1.' })).toEqual({
      mark: 'del', segments: [{ kind: 'del', text: '3. Wärmeübertrager nach Anspruch 1.' }],
    })
  })

  it('marks a replaced word as a deletion then an insertion', () => {
    expect(redlineParagraph({ number: '2', before: 'aus Aluminium bestehen.', after: 'aus Kupfer bestehen.' }).segments).toEqual([
      { kind: 'same', text: '2. aus ' }, { kind: 'del', text: 'Aluminium' }, { kind: 'ins', text: 'Kupfer' }, { kind: 'same', text: ' bestehen.' },
    ])
  })

  it('treats a claim without texts as a new claim with only its number', () => {
    expect(redlineParagraph({ number: '5' })).toEqual({ mark: 'ins', segments: [{ kind: 'ins', text: '5. ' }] })
  })

  it('keeps an unchanged claim as one unchanged run', () => {
    expect(redlineParagraph({ number: '2', before: 'Text.', after: 'Text.' })).toEqual({ mark: 'same', segments: [{ kind: 'same', text: '2. Text.' }] })
  })
})

describe('claimOutcome', () => {
  it('names what the amendment does to each claim', () => {
    expect([
      claimOutcome({ number: '1', before: 'a', after: 'b' }),
      claimOutcome({ number: '2', after: 'b' }),
      claimOutcome({ number: '3', before: 'a' }),
      claimOutcome({ number: '4', before: 'a', after: 'a' }),
    ]).toEqual(['amended', 'added', 'deleted', 'unchanged'])
  })
})

describe('joinSegments', () => {
  it('joins neighbours of one kind and drops empty text', () => {
    expect(joinSegments([
      { kind: 'same', text: 'a' }, { kind: 'same', text: 'b' }, { kind: 'ins', text: '' }, { kind: 'del', text: 'c' }, { kind: 'same', text: 'd' },
    ])).toEqual([{ kind: 'same', text: 'ab' }, { kind: 'del', text: 'c' }, { kind: 'same', text: 'd' }])
  })
})
