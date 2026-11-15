/** The letters and folders of the Letters specs: four letters of the recorded sandbox Mailbox, shortened. */
import type { MyEpoFolderView, MyEpoLetterView, MyEpoMailboxView } from '@deepseek-ai/dsh-api-remotes/client'
import type { Answer } from '../src/client/mailbox.ts'

export const FOLDERS: MyEpoFolderView[] = [{ id: 'drafts', name: 'Drafts' }, { id: 'pdfs', name: 'PDFs' }]

const letter = (id: string, fields: Partial<MyEpoLetterView>): MyEpoLetterView => ({
  id, title: 'Decision to grant a European patent', documentCode: '2006A', dispatchDate: '2023-02-26', read: false, handled: false,
  folderId: 'drafts', applicationNumber: 'EP18123456.8', userReference: 'REF00009', applicantName: 'Dummy applicant 9',
  recipientName: 'Dummy recipient 000026', digitalFile: 'https://my-i.epo.org/user-area/mailbox-intg/applications/EP18123456', ...fields,
})

/** An unread letter, a read and handled one in the other folder, one with no application, and one in a folder that is gone. */
export const LETTERS: MyEpoLetterView[] = [
  letter('grant', {}),
  letter('search', { title: 'European search report', documentCode: 'Search Report', dispatchDate: '2020-02-11', read: true, handled: true, folderId: 'pdfs', applicationNumber: 'EP12346578.3', userReference: 'REF000261', applicantName: 'Dummy applicant 11' }),
  letter('reps', { title: '', documentCode: '52301_CONF', applicationNumber: null, userReference: null, applicantName: null, digitalFile: null }),
  letter('lost', { title: 'Reminder', documentCode: '1081', folderId: 'gone', userReference: null }),
]

export const READ: Extract<MyEpoMailboxView, { kind: 'read' }> = {
  kind: 'read', readAt: '2026-11-15T09:00:00.000Z', letters: LETTERS, folders: FOLDERS, total: LETTERS.length,
}

/** A Remote answer that succeeded. */
export function ok<T>(value: T): Answer<T> {
  return { ok: true, value }
}

/** A Remote answer that failed. */
export function failed(message: string): Answer<never> {
  return { ok: false, error: { message } }
}
