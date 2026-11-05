import { describe, expect, it, vi } from 'vitest'
import type { ShortcutCatalogEntry, ShortcutCommandId, ShortcutFixedCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createAct, type Act, type DocumentId, type FileNumber, type IsoDate, type IsoTime } from '../src/client/api.ts'
import type { Route } from '../src/client/model.ts'
import { dueDay, formatApplicationNumber, formatDate, intlLocale, listTime } from '../src/client/format.ts'
import { commandId, keycapsFrom } from '../src/client/keys.ts'
import { de, en, es, fr, ja, pt, ru, zh } from '../src/client/locales.ts'
import { rowActions, ROW_MENU_TARGET } from '../src/client/row-menu.ts'
import { activityLines, actorName, auditRows, citeText, dueText, fromOffice, letterTitle, listTimeText, officeName, type WordContext } from '../src/client/words.ts'
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

describe('application numbers', () => {
  it('writes an EP number in the office format, whatever spaces or prefix the Record holds, and leaves another office\'s number as it is', () => {
    for (const number of ['24123456.7', '24 123 456.7', 'EP24123456.7', ' EP 24 123 456 . 7 ']) expect(formatApplicationNumber(number)).toBe('EP 24 123 456.7')
    for (const number of ['10 2024 123 456.7', '17/123,456', 'PCT/EP2024/012345', '2412345.6']) expect(formatApplicationNumber(number)).toBe(number)
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
    expect(actorName(words.t, { kind: 'system', name: 'agent' })).toBe('Patent agent')
    expect(actorName(words.t, { kind: 'person', person: fixtures.me.person })).toBe('Dr. Anna Becker')
    expect(actorName(words.t, { kind: 'person', person: { id: null, name: null } })).toBe('A person outside the team')
    expect(actorName(words.t, { kind: 'person', person: { id: 'p-lena' as never, name: null } })).toBe('Unnamed person')
  })

  it('words a person outside the team and an unnamed member inside an event, with a neutral avatar', () => {
    const outsider = { id: null, name: null } as const
    const routed = { ...fixtures.ticket.activity[0]!, for: outsider }
    const filed = { ...fixtures.ticket.activity[4]!, actor: { kind: 'person' as const, person: outsider } }
    const lines = activityLines(words, [routed, filed, { ...routed, for: { id: 'p-lena' as never, name: null } }])
    expect(lines.map(line => line.text)).toEqual([
      'opened the work and assigned it to a person outside the team', 'confirmed the deadline', 'opened the work and assigned it to an unnamed person',
    ])
    expect(lines[1]!.actor).toEqual({ kind: 'person', person: { name: 'A person outside the team', anonymous: true, label: undefined } })
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

  it('words every event type of the Records service', () => {
    // EVENT_TYPES of flowleap-os lib/record/log.mjs.
    const types = [
      'matter/opened', 'office-event/recorded', 'deadline/proposed', 'deadline/confirmed', 'deadline/rejected',
      'document/stored', 'document/duplicate', 'document/unreadable', 'document/read', 'document/match-proposed',
      'document/unmatched', 'document/matched', 'document/filed', 'document/not-relevant',
      'office-event/observed', 'office-event/code-proposed', 'deadline/engine-refused',
      'client/rules-recorded', 'firm/model-provider-recorded',
      'ticket/opened', 'ticket/event-joined', 'ticket/routed', 'ticket/by-hand', 'ticket/wake-started',
      'ticket/run-started', 'ticket/run-failed', 'ticket/proposals-ready', 'ticket/decided', 'ticket/cancelled',
      'report/proposed', 'report/approved', 'report/rejected',
      'outbox/composed', 'outbox/refused', 'outbox/queued', 'outbox/drafted', 'outbox/retrying', 'outbox/send-requested',
      'outbox/sent', 'outbox/dead',
    ]
    const base = fixtures.ticket.activity[0]!
    const texts = activityLines(words, types.map((type, seq) => ({ ...base, seq, type, for: null }))).map(line => line.text)
    expect(texts).not.toContain('changed the record')
    expect(new Set(texts).size).toBe(types.length)
  })
})

describe('offices and citations', () => {
  const german = makeTranslate(de)

  it('names a known office in the UI language with its article, and another office by its own abbreviation', () => {
    expect([officeName(german, 'EPO'), fromOffice(german, 'EPO'), fromOffice(german, 'WIPO')]).toEqual(['EPA', 'vom EPA', 'von der WIPO'])
    expect([officeName(german, 'JPO'), fromOffice(german, 'JPO')]).toEqual(['JPO', 'von JPO'])
  })

  it('words each citation part it knows and keeps any other part as the engine wrote it', () => {
    expect(citeText(german, 'Article 94(3) EPC; EPO calendar 2027; Rule 131(4) EPC, last day of the month; PCT Rule 80.5'))
      .toBe('Artikel 94(3) EPÜ · Kalender des EPA 2027 · Regel 131(4) EPÜ, letzter Tag des Monats · PCT Rule 80.5')
  })
})

describe('the German copy', () => {
  it('names the letter with one word, "Schreiben", as the German mockups and the atlas word of the gate do', () => {
    expect(Object.entries(de).filter(([, text]) => /brief/iu.test(text))).toEqual([])
    expect(de['atlas.deadline.awaiting_code']).toBe('Schreiben wird gelesen')
  })

  it('calls what a reader read of a letter an "Auslesung", never a "Lesung", and a person decides "über" work', () => {
    expect(Object.entries(de).filter(([, text]) => /(?<!Aus)lesung/iu.test(text))).toEqual([])
    expect(de['deadline.prop.reading']).toBe('Auslesung')
    expect(Object.entries(de).filter(([, text]) => /entscheidet diese/u.test(text))).toEqual([])
    expect(de['work.decider.notRoutedPerson']).toBe('{person} entscheidet über diese Arbeit: FlowLeap hat sie zugewiesen.')
  })
})

describe('the copy of every language', () => {
  it('puts no space before an ellipsis', () => {
    for (const dictionary of [en, de, es, fr, ja, pt, ru, zh]) {
      expect(Object.entries(dictionary).filter(([, text]) => /\s…|\s\.\.\./u.test(text))).toEqual([])
    }
    expect(de['act.rejectStep']).toBe('Ablehnen…')
  })

  it('says that FlowLeap records a decision "only once"', () => {
    expect(Object.entries(en).filter(([, text]) => /one time/u.test(text))).toEqual([])
    expect(en['failure.unknown']).toBe('The decision may be recorded. A second try is safe: FlowLeap records it only once.')
  })
})

describe('keycaps', () => {
  it('reads the catalog keycaps of a command and of a fixed key, worded in the UI language, and nothing for an unbound or unknown one', () => {
    const row = (id: string, keycaps?: readonly (readonly string[])[]): ShortcutCatalogEntry => ({
      id: id as ShortcutCommandId, label: id, aliases: [], keys: [], ...(keycaps === undefined ? {} : { keycaps }), aria: undefined,
      binding: null, modified: false, conflicts: [], issue: null,
    })
    const fixed: ShortcutFixedCatalogEntry = { id: 'records.row.open' as ShortcutCommandId, label: 'Open', keys: ['↵'], keycaps: [['↵']], bindings: [], group: 'application' }
    const keycaps = keycapsFrom([row('records.intake.otherMatter', [['M']]), row('records.go.matter', [['G'], ['M']]), row('records.part.reject', []), row('records.retry'), row('records.work.preview', [['Space']])], [fixed], { Space: 'Leer' })
    expect(keycaps(commandId('otherMatter'))).toEqual([['M']])
    expect(keycaps(commandId('goMatter'))).toEqual([['G'], ['M']])
    expect(keycaps(commandId('open'))).toEqual([['↵']])
    expect(keycaps(commandId('reject'))).toEqual([])
    expect(keycaps(commandId('retry'))).toEqual([])
    expect(keycaps(commandId('search'))).toEqual([])
    expect(keycaps(commandId('preview'))).toEqual([['Leer']])
  })
})

describe('the intake row menu', () => {
  const target = { document: R71_DOCUMENT as DocumentId, list: 'waiting' as const, proposed: 'FL-2026-0001' as FileNumber }

  it('offers the row acts with their commands and runs each on that row', async () => {
    const model = { navigate: vi.fn((_route: Route) => {}), perform: vi.fn((_acts: readonly Act[]) => Promise.resolve({ failed: [] })) }
    const writeText = vi.fn((_text: string) => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const acts = rowActions(model, words.t, target, route => `https://firm.test/?records=${route.view}`)
    expect(ROW_MENU_TARGET).toBe('records.intake-row')
    expect(acts.map(act => [act.label, act.commandId])).toEqual([
      ['Open', 'records.row.open'],
      ['Accept and file on FL-2026-0001', 'records.decision.record'],
      ['File on another matter…', 'records.intake.otherMatter'],
      ['Not relevant…', 'records.part.reject'],
      ['Copy link', undefined],
    ])
    for (const act of acts) await act.run?.()
    expect(writeText).toHaveBeenCalledWith('https://firm.test/?records=intake')
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('denied')) } })
    expect(acts.at(-1)?.failureLabel).toBe('FlowLeap could not copy the link.')
    await expect(acts.at(-1)?.run?.()).rejects.toThrow('clipboard')
    vi.unstubAllGlobals()
    expect(model.navigate.mock.calls.map(([route]) => route.view === 'intake' ? route.step : null)).toEqual([undefined, 'other-matter', 'reason'])
    expect(model.perform.mock.calls[0]![0][0]!.command).toEqual({ kind: 'intake.match', document: R71_DOCUMENT, fileNumber: 'FL-2026-0001' })
  })

  it('rejects a failed accept for the menu to report, and offers no accept without a proposed matter', async () => {
    const failed = { failed: [{ act: createAct({ kind: 'intake.match', document: target.document, fileNumber: 'FL-2026-0001' as FileNumber }), error: { kind: 'network' as const } }] }
    const model = { navigate: vi.fn(), perform: vi.fn(() => Promise.resolve(failed)) }
    const accept = rowActions(model, words.t, target, () => '')[1]!
    expect(accept.failureLabel).toBe('FlowLeap did not confirm that it filed the letter. Open the letter to check it.')
    await expect(accept.run?.()).rejects.toThrow('not filed')
    expect(rowActions(model, words.t, { ...target, proposed: null }, () => '').map(act => act.id)).toEqual(['open', 'other-matter', 'not-relevant', 'copy-link'])
  })
})
