import { describe, expect, it, vi } from 'vitest'
import type { ShortcutCatalogEntry, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createAct, type Act, type DocumentId, type FileNumber, type IsoDate, type IsoTime } from '../src/client/api.ts'
import type { Route } from '../src/client/model.ts'
import { dueDay, formatDate, intlLocale, listTime } from '../src/client/format.ts'
import { commandId, keycapsFrom } from '../src/client/keys.ts'
import { de, en } from '../src/client/locales.ts'
import { rowActions, ROW_MENU_TARGET } from '../src/client/row-menu.ts'
import { activityLines, actorName, auditRows, dueText, letterTitle, listTimeText, type WordContext } from '../src/client/words.ts'
import { fixtures, OUTSIDE_WALL, R71_DOCUMENT } from './fixtures.client.ts'

const NOW = Date.parse('2026-11-04T14:30:00Z')
const words: WordContext = { t: makeTranslate(en), locale: 'en', now: NOW, timeZone: 'UTC' }
const german: WordContext = { t: makeTranslate(de), locale: 'de', now: NOW, timeZone: 'UTC' }

describe('days left', () => {
  it.each<[string, string, string]>([
    ['2027-03-01', '117 days left', 'noch 117 Tage'],
    ['2026-11-05', 'Due tomorrow', 'Fällig morgen'],
    ['2026-11-04', 'Due today', 'Heute fällig'],
    ['2026-11-03', 'Overdue by 1 day', '1 Tag überfällig'],
    ['2026-11-01', 'Overdue by 3 days', '3 Tage überfällig'],
  ])('writes %s as %j', (due, english, deutsch) => {
    expect(dueText(words, due as IsoDate)).toBe(english)
    expect(dueText(german, due as IsoDate)).toBe(deutsch)
  })

  it('counts from today in the browser time zone by default', () => {
    expect(dueDay('2026-11-06' as IsoDate, NOW).kind).toBe('left')
  })
})

describe('times and dates', () => {
  it('writes today as the clock, yesterday as a word and older days as a date', () => {
    expect(listTimeText(words, '2026-11-04T14:16:00Z' as IsoTime)).toBe('14:16')
    expect(listTimeText(words, '2026-11-03T09:00:00Z' as IsoTime)).toBe('Yesterday')
    expect(listTimeText(words, '2026-10-30T09:00:00Z' as IsoTime)).toBe('30 Oct')
    expect(listTime('2026-11-04T14:16:00Z' as IsoTime, NOW, 'de').kind).not.toBe('date')
  })

  it('writes dates in the firm region for English', () => {
    expect(intlLocale('en')).toBe('en-GB')
    expect(intlLocale('de')).toBe('de')
    expect(formatDate('2027-03-01' as IsoDate, 'en')).toBe('Mon, 1 Mar 2027')
    expect(formatDate('2027-03-01' as IsoDate, 'en', 'long')).toBe('Monday, 1 March 2027')
  })
})

describe('words of codes and events', () => {
  it('words a letter by its office event, never by its code', () => {
    expect(letterTitle(words.t, 'EPO:R71(3)')).toBe('Rule 71(3) communication')
    expect(letterTitle(german.t, 'EPO:R71(3)')).toBe('Mitteilung nach Regel 71(3)')
    expect(letterTitle(words.t, 'EPO:X99')).toBe('Letter')
    expect(letterTitle(words.t, null)).toBe('Letter')
    expect(letterTitle(words.t, null, { machine: 'intake', state: 'unreadable' })).toBe('Scanned letter with no text')
    expect(letterTitle(words.t, 'EPO:R71(3)', { machine: 'deadline', state: 'code_proposed' })).toBe('Rule 71(3) communication')
  })

  it('names system actors and people by display name', () => {
    expect(actorName(words.t, { kind: 'system', name: 'mailbox' })).toBe('AI mailbox')
    expect(actorName(words.t, { kind: 'system', name: 'office' })).toBe('Patent office')
    expect(actorName(words.t, { kind: 'person', person: fixtures.me.person })).toBe('Dr. Anna Becker')
  })

  it('words Activity events and keeps codes and positions for Audit', () => {
    const lines = activityLines(words, fixtures.ticket.activity)
    expect(lines.map(line => `${line.actor.kind === 'person' ? line.actor.person.name : line.actor.name} ${line.text}`)).toEqual([
      'FlowLeap opened the work and assigned it to Dr. Anna Becker',
      'Patent agent started on the letter',
      'Patent agent proposed the client report',
      'AI mailbox sent the reply',
      'Jonas Weber confirmed the deadline',
    ])
    const unknown = { ...fixtures.ticket.activity[0]!, type: 'ticket/archived', for: null }
    expect(activityLines(words, [unknown])[0]!.text).toBe('changed the record')
    expect(auditRows(fixtures.ticket.activity)[0]!.cells).toEqual(['150', 'ticket/routed', '2026-11-04T14:17:00Z'])
    expect(JSON.stringify(lines)).not.toContain(OUTSIDE_WALL.name)
  })
})

describe('keycaps', () => {
  it('reads a bound command as one keycap box, and nothing for an unbound or unknown one', () => {
    const row = (id: string, keys: readonly string[], bound: boolean): ShortcutCatalogEntry => ({
      id: id as ShortcutCommandId, label: id, aliases: [], keys, aria: undefined, binding: bound ? { code: 'KeyM', modifiers: [] } : null,
      modified: false, conflicts: [], issue: null,
    })
    const keycaps = keycapsFrom([row('records.intake.otherMatter', ['M'], true), row('records.part.reject', ['2'], false), row('records.retry', [], true)])
    expect(keycaps(commandId('otherMatter'))).toEqual([['M']])
    expect(keycaps(commandId('reject'))).toEqual([])
    expect(keycaps(commandId('retry'))).toEqual([])
    expect(keycaps(commandId('search'))).toEqual([])
  })
})

describe('the intake row menu', () => {
  const target = { document: R71_DOCUMENT as DocumentId, list: 'waiting' as const, proposed: 'FL-2026-0001' as FileNumber }

  it('offers the row acts with their commands and runs each on that row', async () => {
    const model = { navigate: vi.fn((_route: Route) => {}), perform: vi.fn((_acts: readonly Act[]) => Promise.resolve({ failed: [] })) }
    const acts = rowActions(model, words.t, target)
    expect(ROW_MENU_TARGET).toBe('records.intake-row')
    expect(acts.map(act => [act.label, act.commandId])).toEqual([
      ['Open', 'records.row.open'],
      ['Accept and file on FL-2026-0001', 'records.decision.record'],
      ['File on another matter…', 'records.intake.otherMatter'],
      ['Not relevant…', 'records.part.reject'],
    ])
    for (const act of acts) await act.run?.()
    expect(model.navigate.mock.calls.map(([route]) => route.view === 'intake' ? route.step : null)).toEqual([undefined, 'other-matter', 'reason'])
    expect(model.perform.mock.calls[0]![0][0]!.command).toEqual({ kind: 'intake.match', document: R71_DOCUMENT, fileNumber: 'FL-2026-0001' })
  })

  it('rejects a failed accept for the menu to report, and offers no accept without a proposed matter', async () => {
    const failed = { failed: [{ act: createAct({ kind: 'intake.match', document: target.document, fileNumber: 'FL-2026-0001' as FileNumber }), error: { kind: 'network' as const } }] }
    const model = { navigate: vi.fn(), perform: vi.fn(() => Promise.resolve(failed)) }
    const accept = rowActions(model, words.t, target)[1]!
    expect(accept.failureLabel).toBe('FlowLeap could not file the letter. Open it and try again.')
    await expect(accept.run?.()).rejects.toThrow('not filed')
    expect(rowActions(model, words.t, { ...target, proposed: null }).map(act => act.id)).toEqual(['open', 'other-matter', 'not-relevant'])
  })
})
