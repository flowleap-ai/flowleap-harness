/**
 * The work of the local admin at record position 45 (a Firm Record of schema 10, with the task model of atlas sheet 0):
 * two matters, the first with a proposed deadline, the first line, and three open tasks of the person, one of them past
 * its legal date. The admin has no display name yet.
 */

import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import type {
  DeadlineId, DocumentSha256, LocalDate, MatterFileNumber, MyWork, PersonId, RecordSeq,
} from '../../../src/types.ts'

const date = (value: string): LocalDate => brandString<LocalDate>(value)

const DEADLINE = brandString<DeadlineId>('0b2d5a8e-4c1f-4e7a-9f31-6d2b8c9e1a57')

/** A valid answer of the Firm Record to `GET /records/api/my-work`. */
export const MY_WORK: MyWork = {
  recordSeq: brandNumber<RecordSeq>(45),
  person: { id: brandString<PersonId>('admin'), name: null },
  summary: { lettersArrived: 1, needYou: 3, overdue: 1, today: 1, later: 1 },
  work: [
    {
      id: `confirm-deadline:${DEADLINE}`,
      task: '5f0c3d2e-1b4a-4c8d-9e7f-2a3b4c5d6e7f',
      kind: 'confirm-deadline',
      title: 'Confirm the deadline',
      why: 'You are the formalities person of the matter.',
      state: 'assigned',
      group: 'overdue',
      dueAt: '2026-11-07T10:00:00.000Z',
      matter: { fileNumber: brandString<MatterFileNumber>('FL-2026-0001'), title: 'Heat pump control' },
      due: date('2026-03-02'),
      since: '2026-11-06T10:00:00.000Z',
      act: `deadline/${DEADLINE}`,
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
      matter: { fileNumber: brandString<MatterFileNumber>('FL-2026-0002'), title: 'Pump seal' },
      due: null,
      since: '2026-11-06T11:30:00.000Z',
      act: 'work/oe-2',
    },
    {
      id: 'decide-work:tk-1',
      task: '7b2e5f40-3d6c-4e0f-9a1b-4c5d6e7f8091',
      kind: 'decide-work',
      title: 'Review the work',
      why: 'The Ticket is routed to you.',
      state: 'assigned',
      group: 'later',
      dueAt: '2026-11-08T12:00:00.000Z',
      matter: { fileNumber: brandString<MatterFileNumber>('FL-2026-0001'), title: 'Heat pump control' },
      due: null,
      since: '2026-11-06T12:00:00.000Z',
      act: 'work/tk-1',
    },
  ],
  inSight: [],
  matters: [
    {
      fileNumber: brandString<MatterFileNumber>('FL-2026-0001'),
      title: 'Heat pump control',
      client: 'Nordwind Energie GmbH',
      applicationNumber: 'EP24166597',
      role: 'responsible',
      state: 'open',
      nextDeadline: { id: DEADLINE, due: date('2026-03-02'), state: 'deadline_proposed' },
    },
    {
      fileNumber: brandString<MatterFileNumber>('FL-2026-0002'),
      title: 'Pump seal',
      client: 'Nordwind Energie GmbH',
      applicationNumber: null,
      role: 'team',
      state: 'open',
      nextDeadline: null,
    },
  ],
}

/** SHA-256 of the document of a `file-letter` item. */
export const FILE_LETTER_SHA256 = brandString<DocumentSha256>('7c1d9e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d')
