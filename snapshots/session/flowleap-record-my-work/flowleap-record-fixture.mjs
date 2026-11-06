/**
 * The Firm Record with the work of one person as the `flowleapRecord` service: the local admin at record position 45,
 * who has no display name yet (`person.name: null`), with two matters (one the admin is responsible for, with a proposed
 * deadline; one in the admin's team, with no open deadline) and three items of work, the last of a kind (`send-report`)
 * that the harness does not know. The Firm Record answers no matter view in this scenario.
 */

/** Cordis plugin name. */
export const name = 'flowleap-record-fixture'

const DEADLINE_ID = '0b2d5a8e-4c1f-4e7a-9f31-6d2b8c9e1a57'

const work = Object.freeze({
  recordSeq: 45,
  person: { id: 'admin', name: null },
  work: [
    {
      id: `confirm-deadline:${DEADLINE_ID}`,
      kind: 'confirm-deadline',
      title: 'Confirm the deadline',
      why: 'The deadline is proposed and needs a second person; you did not record its office event or decide its code, so you may confirm it.',
      matter: { fileNumber: 'FL-2026-0001', title: 'Heat pump control' },
      due: '2026-03-02',
      since: '2026-11-06T10:00:00.000Z',
      act: `deadline/${DEADLINE_ID}`,
    },
    {
      id: 'decide-office-event:oe-2',
      kind: 'decide-office-event',
      title: 'Decide the office event',
      why: 'A letter of the office is filed in your matter and waits for a decision on its event.',
      matter: { fileNumber: 'FL-2026-0002', title: 'Pump seal' },
      due: null,
      since: '2026-11-06T11:30:00.000Z',
      act: 'work/oe-2',
    },
    {
      id: 'send-report:tk-9',
      kind: 'send-report',
      title: 'Send the report',
      why: 'A report to the client is ready and needs your approval to go out.',
      matter: { fileNumber: 'FL-2026-0001', title: 'Heat pump control' },
      due: null,
      since: '2026-11-06T12:00:00.000Z',
      act: 'report/tk-9',
    },
  ],
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
