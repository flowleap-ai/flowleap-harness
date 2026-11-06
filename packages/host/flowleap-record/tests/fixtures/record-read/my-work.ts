/**
 * The work of the local admin at record position 45: two matters, the first with a proposed deadline, and the three
 * kinds of work that wait for the person. The admin has no display name yet.
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
  work: [
    {
      id: `confirm-deadline:${DEADLINE}`,
      kind: 'confirm-deadline',
      title: 'Confirm the deadline',
      why: 'The deadline is proposed and needs a second person; you did not record its office event or decide its code, so you may confirm it.',
      matter: { fileNumber: brandString<MatterFileNumber>('FL-2026-0001'), title: 'Heat pump control' },
      due: date('2026-03-02'),
      since: '2026-11-06T10:00:00.000Z',
      act: `deadline/${DEADLINE}`,
    },
    {
      id: 'decide-office-event:oe-2',
      kind: 'decide-office-event',
      title: 'Decide the office event',
      why: 'A letter of the office is filed in your matter and waits for a decision on its event.',
      matter: { fileNumber: brandString<MatterFileNumber>('FL-2026-0002'), title: 'Pump seal' },
      due: null,
      since: '2026-11-06T11:30:00.000Z',
      act: 'work/oe-2',
    },
    {
      id: 'decide-work:tk-1',
      kind: 'decide-work',
      title: 'Decide the work of the Ticket',
      why: 'A run proposed its work in your matter and waits for your decision.',
      matter: { fileNumber: brandString<MatterFileNumber>('FL-2026-0001'), title: 'Heat pump control' },
      due: null,
      since: '2026-11-06T12:00:00.000Z',
      act: 'work/tk-1',
    },
  ],
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
