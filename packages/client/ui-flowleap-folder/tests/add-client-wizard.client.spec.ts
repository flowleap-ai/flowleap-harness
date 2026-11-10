import { describe, expect, it } from 'vitest'
import type { DocketState } from '../src/add-client/wire.ts'
import type { ClientDetail, PartyId } from '../src/client/add-client/records.ts'
import {
  applicationsOf, canOpen, capped, clientIdOf, decisionOf, groupOf, hitsOf, isTicked, markOf, matterRows, nextOf, previousOf, sameGroup,
  stepsOf, waitOf, type FindStatus, type WizardView,
} from '../src/client/add-client/wizard.ts'
import { AS_OF, SCHUBERT_ID, SYNTEGON_ID, checked, docketRow, firmClient, registerHit, wizardView } from './add-client-fakes.client.ts'

/** Syntegon, a client of your firm; Gerhard Schubert GmbH opposed its application EP23171862. */
const SYNTEGON: ClientDetail = {
  client: firmClient(SYNTEGON_ID, 'Syntegon', 'client', ['SYNTEGON TECHNOLOGY']),
  names: [],
  applications: [{
    applicationNumber: 'EP23171862', publicationNumber: 'EP4292805A1', title: 'Packaging element',
    roles: [
      { partyId: 'party-1' as PartyId, party: 'Syntegon Technology GmbH', role: 'applicant' },
      { partyId: 'party-2' as PartyId, party: 'GERHARD SCHUBERT', role: 'opponent' },
    ],
  }],
  conflictChecks: [],
}

/** A wizard of Gerhard Schubert, whose name the Firm Record has as the opponent of a client. */
const schubert = (fields: Partial<WizardView> = {}): WizardView => wizardView({
  query: 'Gerhard Schubert',
  group: { name: 'Gerhard Schubert', names: [{ name: 'GERHARD SCHUBERT', source: 'ep-register', applications: 57 }], byName: false },
  firm: { status: 'ready', details: [SYNTEGON], asOf: AS_OF },
  ...fields,
})

const found = (names: readonly [string, boolean][]): FindStatus => ({
  status: 'found', source: 'patstat', edition: '2026 Spring', asOf: AS_OF, truncated: false, sampleRows: 5000, omitted: 0,
  names: names.map(([name, ticked]) => ({ name, matching: 10, ticked })),
})

const read = (docket: DocketState): WizardView['docket'] => ({ status: 'read', docket, counts: [], rows: [] })

describe('the steps of each role', () => {
  it('gives Client a conflict check, Watch no fourth step, and Other party a Matter step', () => {
    expect(stepsOf(null)).toEqual(['company', 'matters', 'role', 'conflict', 'review'])
    expect(stepsOf('client')).toEqual(['company', 'matters', 'role', 'conflict', 'review'])
    expect(stepsOf('watch')).toEqual(['company', 'matters', 'role', 'review'])
    expect(stepsOf('other-party')).toEqual(['company', 'matters', 'role', 'matter', 'review'])
  })

  it('goes to the next step of the role, and to Review after Edit or from a step that the role does not have', () => {
    expect(nextOf(wizardView({ at: 'company' }))).toBe('matters')
    expect(nextOf(wizardView({ at: 'role' }))).toBe('conflict')
    expect(nextOf(wizardView({ at: 'role', role: 'watch' }))).toBe('review')
    expect(nextOf(wizardView({ at: 'role', role: 'other-party' }))).toBe('matter')
    expect(nextOf(wizardView({ at: 'matters', editing: true }))).toBe('review')
    expect(nextOf(wizardView({ at: 'review' }))).toBe('review')
    expect(nextOf(wizardView({ at: 'conflict', role: 'watch' }))).toBe('review')
  })

  it('goes back to the step before, and nowhere from Company', () => {
    expect(previousOf(wizardView({ at: 'company' }))).toBeNull()
    expect(previousOf(wizardView({ at: 'conflict' }))).toBe('role')
    expect(previousOf(wizardView({ at: 'review', role: 'watch' }))).toBe('role')
    expect(previousOf(wizardView({ at: 'review', role: 'other-party' }))).toBe('matter')
  })
})

describe('why the Company step waits', () => {
  const company = (fields: Partial<WizardView>) => waitOf(wizardView(fields), 'company')

  it('waits for a name, for the search, and for a search that works', () => {
    expect(company({ query: '  ' })).toBe('type')
    expect(company({ find: { status: 'empty' } })).toBe('search')
    expect(company({ find: { status: 'loading', skeleton: true } })).toBe('search')
    expect(company({ find: { status: 'no-key' } })).toBe('find-failed')
    expect(company({ find: { status: 'error', error: 'unreachable' } })).toBe('find-failed')
  })

  it('goes on by name only, also with no data plugin', () => {
    expect(company({ find: { status: 'by-name' }, docket: { status: 'idle' } })).toBeNull()
    expect(company({ find: { status: 'no-plugin' }, docket: { status: 'no-plugin' } })).toBeNull()
  })

  it('waits for a ticked name', () => {
    expect(company({ find: found([['SYNTEGON TECHNOLOGY', false]]) })).toBe('names')
    expect(company({ find: found([['SYNTEGON TECHNOLOGY', false], ['SYNTEGON POUCH SYSTEMS', true]]) })).toBeNull()
  })

  it('waits for a docket with rows to use, and goes on with no firm identity or no data plugin', () => {
    const progress = { slicesDone: 3, slices: 12, rows: 40 }
    expect(company({ docket: { status: 'idle' } })).toBe('docket')
    expect(company({ docket: { status: 'loading' } })).toBe('docket')
    expect(company({ docket: { status: 'error', error: 'internal' } })).toBe('docket')
    expect(company({ docket: read({ state: 'reading', progress }) })).toBe('docket')
    expect(company({ docket: read({ state: 'interrupted', progress }) })).toBe('docket')
    expect(company({ docket: read({ state: 'failed', reason: 'no-key', failed: [] }) })).toBe('docket')
    expect(company({ docket: read({ state: 'ready', rows: 1, asOf: AS_OF }) })).toBeNull()
    expect(company({ docket: read({ state: 'stale', rows: 1, asOf: AS_OF }) })).toBeNull()
    expect(company({ docket: read({ state: 'partial', rows: 1, asOf: AS_OF, failed: [], mismatches: [] }) })).toBeNull()
    expect(company({ docket: read({ state: 'no_identity' }) })).toBeNull()
    expect(company({ docket: { status: 'no-plugin' } })).toBeNull()
  })
})

describe('why the other steps wait', () => {
  it('never waits on Matters, and waits for a role on Role', () => {
    expect(waitOf(wizardView({ docket: { status: 'idle' } }), 'matters')).toBeNull()
    expect(waitOf(wizardView({ role: null }), 'role')).toBe('role')
    expect(waitOf(wizardView({ role: 'watch' }), 'role')).toBeNull()
  })

  it('waits on the conflict check for a read that failed, a read that runs, and a half that is not complete', () => {
    const conflict = (fields: Partial<WizardView>) => waitOf(wizardView(fields), 'conflict')
    expect(conflict({ firm: { status: 'error', error: { kind: 'network' } } })).toBe('conflict-failed')
    expect(conflict({ check: { status: 'error', error: 'unreachable' } })).toBe('conflict-failed')
    expect(conflict({ check: { status: 'no-key' } })).toBe('conflict-failed')
    expect(conflict({ firm: { status: 'loading' } })).toBe('conflict-reading')
    expect(conflict({ check: { status: 'loading' } })).toBe('conflict-reading')
    const half = { state: 'incomplete' as const, failed: [], mismatches: [{ query: 'op=x', total: 3, counted: 2, missing: 1 }] }
    expect(conflict({ check: { status: 'checked', answer: checked([], { groupOpposedClients: { state: 'complete', asOf: AS_OF }, clientsOpposedGroup: half }) } })).toBe('conflict-failed')
    expect(conflict({ check: { status: 'checked', answer: checked([], { groupOpposedClients: { state: 'reading' }, clientsOpposedGroup: { state: 'complete', asOf: AS_OF } }) } })).toBe('conflict-reading')
    expect(conflict({})).toBeNull()
  })

  it('waits on a possible conflict, or by name only, until it is checked with a reason', () => {
    const register = { check: { status: 'checked' as const, answer: checked([registerHit(SCHUBERT_ID)]) } }
    expect(waitOf(wizardView(register), 'conflict')).toBe('conflict-check')
    expect(waitOf(wizardView({ ...register, conflict: { checked: true, reason: ' ' } }), 'conflict')).toBe('conflict-check')
    expect(waitOf(wizardView({ ...register, conflict: { checked: false, reason: 'Closed.' } }), 'conflict')).toBe('conflict-check')
    expect(waitOf(wizardView({ ...register, conflict: { checked: true, reason: 'Closed.' } }), 'conflict')).toBeNull()
    expect(waitOf(schubert(), 'conflict')).toBe('conflict-check')
    expect(waitOf(wizardView({ check: { status: 'by-name' } }), 'conflict')).toBe('conflict-check')
    expect(waitOf(wizardView({ check: { status: 'by-name' }, conflict: { checked: true, reason: 'Asked the partners.' } }), 'conflict')).toBeNull()
  })

  it('waits on the Matter step for the Firm Record and a chosen matter', () => {
    const matter = (fields: Partial<WizardView>) => waitOf(wizardView({ role: 'other-party', ...fields }), 'matter')
    expect(matter({ firm: { status: 'loading' } })).toBe('firm')
    expect(matter({ firm: { status: 'error', error: { kind: 'unavailable' } } })).toBe('firm-failed')
    expect(matter({})).toBe('matter')
    expect(matter({ other: { applicationNumber: 'EP23171862', role: 'licensee' } })).toBeNull()
  })

  it('waits on Review for a recording that runs, the first step that waits, and a name that no folder can have', () => {
    expect(waitOf(wizardView({ recording: { status: 'running', done: 1, total: 3 } }), 'review')).toBe('busy')
    expect(waitOf(wizardView({ role: null }), 'review')).toBe('role')
    expect(waitOf(wizardView({ find: { status: 'empty' } }), 'review')).toBe('search')
    // Watch has no conflict check, so a possible conflict does not stop it.
    expect(waitOf(schubert({ role: 'watch' }), 'review')).toBeNull()
    expect(waitOf(schubert(), 'review')).toBe('conflict-check')
    expect(waitOf(wizardView({ role: 'other-party' }), 'review')).toBe('matter')
    const con = { name: 'CON', names: [], byName: true }
    expect(waitOf(wizardView({ group: con }), 'review')).toBe('name')
    expect(waitOf(wizardView({ group: con, role: 'watch' }), 'review')).toBeNull()
    expect(waitOf(wizardView({ group: null }), 'review')).toBeNull()
    expect(waitOf(wizardView({ group: { ...con, name: 'Novo Nordisk A/S' } }), 'review')).toBeNull()
  })
})

describe('the stepper', () => {
  const marks = (view: WizardView) => stepsOf(view.role).map(step => markOf(view, step))
  const links = (view: WizardView) => stepsOf(view.role).filter(step => canOpen(view, step))

  it('marks the reached steps that do not wait done, the open step current and the rest not yet, and links the reached steps', () => {
    const view = wizardView({ at: 'matters', reached: 'matters' })
    expect(marks(view)).toEqual(['done', 'current', 'todo', 'todo', 'todo'])
    expect(links(view)).toEqual(['company'])
    expect(marks(wizardView({ at: 'review', role: 'watch' }))).toEqual(['done', 'done', 'done', 'current'])
  })

  it('marks a reached step that waits as not yet, and links no step after it', () => {
    const view = wizardView({ at: 'review', role: null })
    expect(marks(view)).toEqual(['done', 'done', 'todo', 'done', 'current'])
    expect(links(view)).toEqual(['company', 'matters', 'role'])
    expect(links(wizardView({ at: 'role', find: { status: 'empty' } }))).toEqual(['company'])
  })

  it('marks an open conflict blocked, also as the open step, and still links Review', () => {
    expect(marks(schubert({ at: 'review' }))).toEqual(['done', 'done', 'done', 'blocked', 'current'])
    expect(marks(schubert({ at: 'conflict' }))).toEqual(['done', 'done', 'done', 'blocked', 'todo'])
    expect(links(schubert({ at: 'company' }))).toEqual(['matters', 'role', 'conflict', 'review'])
    // A conflict check that the person did not reach is not blocked yet.
    expect(markOf(schubert({ at: 'role', reached: 'role' }), 'conflict')).toBe('todo')
  })
})

describe('the matters of the group', () => {
  const rows = [
    docketRow('EP23171862'),
    docketRow('EP25712875', { publicationNumber: undefined, title: undefined, representativeSince: undefined }),
    docketRow('EP23165015', { addressOnly: true }),
    docketRow('EP99000001', { names: ['ANOTHER NAME'] }),
  ]
  const view = (fields: Partial<WizardView> = {}) => wizardView({ docket: { status: 'read', docket: { state: 'ready', rows: 4, asOf: AS_OF }, counts: [], rows }, ...fields })

  it('shows the docket rows of the confirmed names, with an address-only row unticked', () => {
    expect(matterRows(view()).map(row => row.applicationNumber)).toEqual(['EP23171862', 'EP25712875', 'EP23165015'])
    expect(matterRows(view()).map(row => isTicked(view(), row))).toEqual([true, true, false])
    const ticks = { EP23165015: true, EP23171862: false }
    expect(matterRows(view({ ticks })).map(row => isTicked(view({ ticks }), row))).toEqual([false, true, true])
  })

  it('shows no row before the group is confirmed or while the docket has no rows to use', () => {
    expect(matterRows(view({ group: null }))).toEqual([])
    expect(matterRows(view({ docket: { status: 'loading' } }))).toEqual([])
    expect(matterRows(view({ docket: { status: 'read', docket: { state: 'failed', reason: 'unreachable', failed: [] }, counts: [], rows } }))).toEqual([])
  })

  it('records only the ticked rows, each with the facts that the register gives', () => {
    expect(applicationsOf(view({ ticks: { EP23165015: true, EP23171862: false } }))).toEqual([
      { fact: { applicationNumber: 'EP25712875', basis: 'register' }, applicants: ['Syntegon Technology GmbH'] },
      {
        fact: { applicationNumber: 'EP23165015', basis: 'register', publicationNumber: 'EP4292805A1', title: 'Method and apparatus for producing a packaging element', representativeSince: '2024-07-24' },
        applicants: ['Syntegon Technology GmbH'],
      },
    ])
  })
})

describe('the hits of the conflict check', () => {
  it('finds no hit before the Firm Record answers or before the group is confirmed', () => {
    expect(hitsOf(schubert({ firm: { status: 'loading' } }))).toEqual([])
    expect(hitsOf(schubert({ group: null }))).toEqual([])
  })

  it('takes the hits of the Firm Record and of the register once each, without the existing client', () => {
    const record = hitsOf(schubert())
    expect(record).toMatchObject([{ applicationNumber: 'EP23171862', otherParty: 'GERHARD SCHUBERT', existingClientId: SYNTEGON_ID, source: 'firm-record' }])
    const same = registerHit(SYNTEGON_ID, { applicationNumber: 'EP23171862', otherParty: 'Gerhard Schubert', otherPartyRole: 'opponent' })
    expect(hitsOf(schubert({ check: { status: 'checked', answer: checked([same, registerHit(SYNTEGON_ID)]) } })).map(hit => hit.source)).toEqual(['firm-record', 'ep-register'])
    expect(hitsOf(schubert({ existing: SYNTEGON.client }))).toEqual([])
  })
})

describe('the group and the decision', () => {
  it('confirms the ticked names with their source, or the client by name only', () => {
    const view = wizardView({ query: ' Syntegon ', find: found([['SYNTEGON TECHNOLOGY', true], ['SYNTEGON POUCH SYSTEMS', false]]) })
    expect(groupOf(view)).toEqual({ name: 'Syntegon', names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat', applications: 10, edition: '2026 Spring' }], byName: false })
    const register: FindStatus = { status: 'found', source: 'ep-register', asOf: AS_OF, truncated: false, sampleRows: 1, omitted: 0, names: [{ name: 'X', matching: 1, ticked: true }] }
    expect(groupOf(wizardView({ find: register })).names).toEqual([{ name: 'X', source: 'ep-register', applications: 1 }])
    expect(groupOf(wizardView({ query: 'Neue GmbH ', find: { status: 'by-name' } }))).toEqual({ name: 'Neue GmbH', names: [], byName: true })
    expect(groupOf(wizardView({ existing: firmClient(SYNTEGON_ID, 'Syntegon SE') })).name).toBe('Syntegon SE')
  })

  it('is the same group when the name and the names are the same', () => {
    const group = groupOf(wizardView())
    expect(sameGroup(group, { ...group, names: group.names.map(item => ({ ...item, applications: 1 })) })).toBe(true)
    expect(sameGroup(group, { ...group, names: [] })).toBe(false)
    expect(sameGroup(group, { ...group, name: 'Syntegon SE' })).toBe(false)
    expect(sameGroup(group, { ...group, byName: true })).toBe(false)
  })

  it('says "10,000+" from the EPO cap on', () => {
    expect([capped(9_999), capped(10_000), capped(12_000)]).toEqual([false, true, true])
  })

  it('records under the existing client of the chosen role, else under the new id', () => {
    const watched = firmClient(SCHUBERT_ID, 'Syntegon', 'watch')
    expect(clientIdOf(wizardView({ existing: watched, role: 'watch' }))).toBe(SCHUBERT_ID)
    expect(clientIdOf(wizardView({ existing: watched, role: 'client' }))).toBe(wizardView().newId)
  })

  it('decides each role with its facts, and a reason only for a hit or by name only', () => {
    const view = schubert({ conflict: { checked: true, reason: ' Closed. ' }, other: { applicationNumber: null, role: 'licensee' } })
    const group = groupOf(view)
    expect(decisionOf(view, group, 'watch')).toEqual({ role: 'watch', clientId: view.newId, name: 'Gerhard Schubert', names: group.names })
    expect(decisionOf(view, group, 'other-party')).toMatchObject({ role: 'other-party', matter: { applicationNumber: '', role: 'licensee' } })
    expect(decisionOf(view, group, 'client')).toMatchObject({ role: 'client', hits: [{ otherParty: 'GERHARD SCHUBERT' }], reason: 'Closed.', applications: [] })
    expect('reason' in decisionOf(wizardView({ conflict: { checked: true, reason: 'x' } }), group, 'client')).toBe(false)
    expect(decisionOf(wizardView({ check: { status: 'by-name' }, conflict: { checked: true, reason: 'Asked. ' } }), group, 'client')).toMatchObject({ hits: [], reason: 'Asked.' })
  })
})
