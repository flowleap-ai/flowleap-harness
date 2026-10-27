/**
 * The EP Register events of EP 3 456 789 A1, recorded on 2026-10-27, as the `flowleapRegister` service.
 * The register lists the four older events until `publish()` adds the newest one, as a register does when the office acts.
 */

/** Cordis plugin name. */
export const name = 'flowleap-register-fixture'

const NEWEST = Object.freeze({ date: '2020-12-18', code: '7', description: 'No opposition filed within time limit' })
const OLDER = Object.freeze([
  { date: '2020-01-10', code: '8', description: 'The patent has been granted' },
  { date: '2019-10-10', code: '12', description: 'Grant of patent is intended' },
  { date: '2019-04-26', code: '15', description: 'Request for examination was made' },
  { date: '2019-02-15', code: '16', description: 'The application has been published' },
])

/** Provide the recorded reader; any other application has no recorded register. */
export function apply(ctx) {
  let events = OLDER
  ctx.provide('flowleapRegister', {
    read: async (application) => {
      if (application !== 'EP3456789') throw new Error(`no recorded register for ${application}`)
      return events
    },
    publish: () => { events = [NEWEST, ...OLDER] },
  })
}
