/**
 * The Firm Record with the work of one person as the `flowleapRecord` service: the local admin at record position 45,
 * who has no display name yet (`person.name: null`), with two matters (one the admin is responsible for, with a proposed
 * deadline; one in the admin's team, with no open deadline), the first line of My work, and three open tasks, the last of a
 * kind (`day-check`) that the harness does not know. The Firm Record answers no matter view in this scenario.
 */

/** Cordis plugin name. */
export const name = 'flowleap-record-fixture'

const DEADLINE_ID = '0b2d5a8e-4c1f-4e7a-9f31-6d2b8c9e1a57'

const work = Object.freeze({
  recordSeq: 45,
  person: { id: 'admin', name: null },
  summary: { lettersArrived: 1, needYou: 3, overdue: 1, today: 1, later: 1 },
  work: [
    {
      id: `confirm-deadline:${DEADLINE_ID}`,
      task: '5f0c3d2e-1b4a-4c8d-9e7f-2a3b4c5d6e7f',
      kind: 'confirm-deadline',
      title: 'Confirm the deadline',
      why: 'You are the formalities person of the matter.',
      state: 'assigned',
      group: 'overdue',
      dueAt: '2026-11-07T10:00:00.000Z',
      matter: { fileNumber: 'FL-2026-0001', title: 'Heat pump control' },
      due: '2026-03-02',
      since: '2026-11-06T10:00:00.000Z',
      act: `deadline/${DEADLINE_ID}`,
    },
    {
      id: 'decide-office-event:oe-2',
      task: '6a1d4e3f-2c5b-4d9e-8f0a-3b4c5d6e7f80',
      kind: 'decide-office-event',
      title: 'Check the office event',
      why: 'You are the formalities person of the matter.',
      state: 'escalated',
      group: 'today',
      dueAt: '2026-11-07T11:30:00.000Z',
      matter: { fileNumber: 'FL-2026-0002', title: 'Pump seal' },
      due: null,
      since: '2026-11-06T11:30:00.000Z',
      act: 'work/oe-2',
    },
    {
      id: 'day-check:2026-11-09',
      task: '7b2e5f40-3d6c-4e0f-9a1b-4c5d6e7f8091',
      kind: 'day-check',
      title: 'Check the deadlines due today',
      why: 'You check the deadlines of the firm at the end of each working day.',
      state: 'assigned',
      group: 'later',
      matter: null,
      due: null,
      dueAt: '2026-11-09T17:00:00.000Z',
      since: '2026-11-06T12:00:00.000Z',
      act: 'deadlines/today',
    },
  ],
  inSight: [],
  matters: [
    {
      fileNumber: 'FL-2026-0001',
      title: 'Heat pump control',
      client: 'Nordwind Energie GmbH',
      applicationNumber: 'EP24166597',
      role: 'responsible',
      state: 'open',
      nextDeadline: { id: DEADLINE_ID, due: '2026-03-02', state: 'deadline_proposed' },
    },
    {
      fileNumber: 'FL-2026-0002',
      title: 'Pump seal',
      client: 'Nordwind Energie GmbH',
      applicationNumber: 'EP21755382',
      role: 'team',
      state: 'open',
      nextDeadline: null,
    },
  ],
})

/** Provide the recorded Firm Record; it answers no matter view. */
export function apply(ctx) {
  ctx.provide('flowleapRecord', {
    matterView: async () => ({ error: 'not_found' }),
    myWork: async () => work,
  })
}
