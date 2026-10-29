/**
 * Durable routine state: the watched applications, options, and seen entries per task; the latest read per
 * application; the "Needs review" mark per chat that received a run; and the chat of each task's pending run.
 */
import { z } from 'zod'
import { parseRegisterApplication, type RegisterApplication } from '@deepseek-ai/dsh-flowleap-connectors'
import type { ScheduleRecord } from '@deepseek-ai/dsh-schedule'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { ReviewState } from './types.ts'

const applicationSchema = z.string().transform((value, context): RegisterApplication => {
  const parsed = parseRegisterApplication(value)
  if (parsed === value) return parsed
  context.addIssue({ code: 'custom', message: `not a normalized application: ${value}` })
  return z.NEVER
})

/** Identity of the scheduled task that runs a watch. */
export type TaskId = ScheduleRecord['id']

const countsSchema = z.record(z.string(), z.number().int().positive())

/**
 * One watch: the id of the scheduled task it belongs to is its key. A row written before the options existed
 * parses with both options off, so it behaves as it did then.
 */
export const watchSchema = z.object({
  /** Watched applications in the order the attorney named them, each with the entries reported or present at the start. */
  applications: z.array(z.object({ application: applicationSchema, seen: countsSchema }).strict()).min(1),
  /** Each run opens a new chat in the workspace of the task's chat instead of a message in that chat. */
  newChat: z.boolean().default(false),
  /** A finished run marks the chat that received it "Needs review". */
  needsReview: z.boolean().default(false),
}).strict()

/** Stored watch value. */
export type WatchRecord = z.infer<typeof watchSchema>

/** The two watch options as the tool resolved them. */
export type WatchOptions = Pick<WatchRecord, 'newChat' | 'needsReview'>

/** The latest read of one application, shared by every watch that names it. */
export const readSchema = z.object({
  /** RFC 3339 UTC time of the read. */
  readAt: z.iso.datetime(),
  /** Entries of that read. */
  entries: z.array(z.object({ date: z.string(), code: z.string(), description: z.string() }).strict()),
}).strict()

/** Stored read value. */
export type ReadRecord = z.infer<typeof readSchema>

/** The mark of one chat that received a run: the chat's SessionId is its key, and a later run into the same chat replaces it. */
export const reviewSchema = z.object({
  /** The scheduled task whose run the chat received. */
  taskId: z.string().min(1),
  /** `running` while the run works; `needs_review` once it finished or the Host restarted. */
  state: z.enum(['running', 'needs_review'] satisfies readonly ReviewState[]),
  /** RFC 3339 UTC time the state was entered. */
  since: z.iso.datetime(),
}).strict()

/** Stored review value. */
export type ReviewRecord = z.infer<typeof reviewSchema>

/** The chat a task's pending run was given: the task id is its key, and `schedule/delivered` deletes it. */
export const runChatSchema = z.object({
  /** The task's target when the chat was opened; a committed delivery moves the target, so a later run opens a new chat. */
  scheduledAt: z.iso.datetime(),
  /** The chat that receives the run. */
  sessionId: z.string().min(1).transform(value => SessionId(value)),
  /** RFC 3339 UTC time the chat was opened. */
  openedAt: z.iso.datetime(),
}).strict()

/** Stored run chat value. */
export type RunChatRecord = z.infer<typeof runChatSchema>

/** The `flowleap_routines` domain; a malformed row rejects opening it. */
export const routinesDomain = defineDomain({
  name: 'flowleap_routines', version: 1,
  tables: {
    watches: domainTable<TaskId, WatchRecord>(watchSchema),
    reads: domainTable<RegisterApplication, ReadRecord>(readSchema),
    reviews: domainTable<SessionId, ReviewRecord>(reviewSchema),
    run_chats: domainTable<string, RunChatRecord>(runChatSchema),
  },
})
