/**
 * The view logic of My work (atlas sheet 0, decision B9): the groups by due time, the status of each task's object,
 * the matter's client, and the first line. The status of a letter comes from the intake list, of a deadline task from
 * the deadline that the task's subject names, and otherwise from the one waiting state of the kind.
 */

import type { AtlasRef } from './atlas.ts'
import type { DeadlineState } from './atlas.ts'
import type { FileNumber, IntakeList, IsoDate, MyWork, Task, TaskKind, WorkGroup, WorkItem } from './api.ts'
import { dayOf } from './format.ts'

/** The due-time groups, in the order My work shows them. */
export const WORK_GROUPS: readonly WorkGroup[] = ['overdue', 'today', 'later']

/**
 * The waiting state of each task kind whose object has one waiting state. A letter (`file-letter`) waits in one of six
 * intake states and takes its state from the intake list; `answer` has no object state.
 */
const KIND_STATUS: Readonly<Record<Exclude<TaskKind, 'file-letter'>, AtlasRef | null>> = {
  'enter-office-event': { machine: 'intake', state: 'unreadable' },
  'decide-office-event': { machine: 'deadline', state: 'code_proposed' },
  'enter-date': { machine: 'deadline', state: 'engine_refused' },
  'confirm-deadline': { machine: 'deadline', state: 'deadline_proposed' },
  'decide-dispute': { machine: 'deadline', state: 'disputed' },
  'assign-person': { machine: 'ticket', state: 'no_person' },
  'restart-run': { machine: 'ticket', state: 'run_failed' },
  'decide-work': { machine: 'ticket', state: 'proposals_ready' },
  'work-by-hand': { machine: 'ticket', state: 'by_hand' },
  'send-report': { machine: 'report', state: 'approved' },
  'fix-message': { machine: 'outbox', state: 'refused' },
  'follow-up': { machine: 'deadline', state: 'active' },
  'day-check': { machine: 'deadline', state: 'active' },
  'answer': null,
}

/**
 * The document of a task on a letter, from its record address `intake/<list>/<sha256>`.
 * @param item - the task.
 * @returns the document's SHA-256, or null for a task on another object.
 */
export function letterOf(item: Task): string | null {
  const [view, , document] = item.act.split('/')
  return view === 'intake' && document !== undefined ? document : null
}

/**
 * The status of a task's object.
 * @param item - the task.
 * @param letters - the intake waiting list, or null while it has not loaded.
 * @param deadline - the state of the deadline that the task is about, or null where the answer names none.
 * @returns the object's atlas state, or null when it is not known yet.
 */
export function workStatus(item: Task, letters: IntakeList | null, deadline: DeadlineState | null): AtlasRef | null {
  if (item.kind === 'file-letter') {
    const document = letterOf(item)
    return letters?.rows.find(row => row.document === document)?.status ?? null
  }
  const status = KIND_STATUS[item.kind]
  return status?.machine === 'deadline' && deadline !== null ? { machine: 'deadline', state: deadline } : status
}

/**
 * The person's tasks by due-time group, in the order of the answer (the next step first); an empty group is absent.
 * @param work - the person's open tasks.
 * @returns the groups that have tasks.
 */
export function groupWork(work: readonly WorkItem[]): readonly { readonly group: WorkGroup; readonly items: readonly WorkItem[] }[] {
  return WORK_GROUPS.flatMap((group) => {
    const items = work.filter(item => item.group === group)
    return items.length === 0 ? [] : [{ group, items }]
  })
}

/**
 * The client of each matter of the person's teams.
 * @param data - My work.
 * @returns the lookup by file number.
 */
export function clientsOf(data: MyWork): ReadonlyMap<FileNumber, string> {
  return new Map(data.matters.map(matter => [matter.fileNumber, matter.client]))
}

/**
 * The calendar day of a task's own due time, for its days left.
 * @param item - the task.
 * @param timeZone - the time zone of "today"; the browser's when absent.
 * @returns the day.
 */
export function taskDueDay(item: Task, timeZone?: string): IsoDate {
  return dayOf(Date.parse(item.dueAt), timeZone) as IsoDate
}

/**
 * The parts of the lede after the date: the count of each group that has tasks, in group order.
 * @param data - My work.
 * @returns each group with its count.
 */
export function ledeCounts(data: MyWork): readonly { readonly group: WorkGroup; readonly count: number }[] {
  return WORK_GROUPS.flatMap(group => data.summary[group] === 0 ? [] : [{ group, count: data.summary[group] }])
}
