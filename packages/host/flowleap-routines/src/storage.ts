/** Durable register watch state: the watched applications and seen entries per task, and the latest read per application. */
import { z } from 'zod'
import { parseRegisterApplication, type RegisterApplication } from '@deepseek-ai/dsh-flowleap-connectors'
import type { ScheduleRecord } from '@deepseek-ai/dsh-schedule'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

const applicationSchema = z.string().transform((value, context): RegisterApplication => {
  const parsed = parseRegisterApplication(value)
  if (parsed === value) return parsed
  context.addIssue({ code: 'custom', message: `not a normalized application: ${value}` })
  return z.NEVER
})

/** Identity of the scheduled task that runs a watch. */
export type TaskId = ScheduleRecord['id']

const countsSchema = z.record(z.string(), z.number().int().positive())

/** One watch: the id of the scheduled task it belongs to is its key. */
export const watchSchema = z.object({
  /** Watched applications in the order the attorney named them, each with the entries reported or present at the start. */
  applications: z.array(z.object({ application: applicationSchema, seen: countsSchema }).strict()).min(1),
}).strict()

/** Stored watch value. */
export type WatchRecord = z.infer<typeof watchSchema>

/** The latest read of one application, shared by every watch that names it. */
export const readSchema = z.object({
  /** RFC 3339 UTC time of the read. */
  readAt: z.iso.datetime(),
  /** Entries of that read. */
  entries: z.array(z.object({ date: z.string(), code: z.string(), description: z.string() }).strict()),
}).strict()

/** Stored read value. */
export type ReadRecord = z.infer<typeof readSchema>

/** The `flowleap_routines` domain; a malformed row rejects opening it. */
export const routinesDomain = defineDomain({
  name: 'flowleap_routines', version: 1,
  tables: {
    watches: domainTable<string, WatchRecord>(watchSchema),
    reads: domainTable<RegisterApplication, ReadRecord>(readSchema),
  },
})
