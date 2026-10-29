/**
 * The template save of `office-action-scaffold`: before any disk access it validates the `officeAction` input and
 * renders the report body from it; after the report is on disk it writes the work page beside the report and marks it
 * as delivered, so a direct edit of the page is steered back to the writer.
 * @module
 */

import type { DeliveredPaths } from '../guard/seal.ts'
import type { TemplateSave } from '../writer.ts'
import { officeActionSave } from './office-action-input.ts'
import type { WorkPages } from './store.ts'

/** What the office action save needs from the plugin. */
export interface OfficeActionSaveDependencies {
  readonly workPages: WorkPages
  readonly delivered?: DeliveredPaths
  readonly warn: (message: string) => void
}

const NO_FINDINGS = 'Work page: none, because this save has no officeAction. The office action board shows only an analysis that is saved with officeAction.'

/**
 * Build the `office-action-scaffold` template save.
 * @param deps - the work pages, the register of delivered paths, and the warning log.
 * @returns the template save.
 */
export function officeActionTemplateSave(deps: OfficeActionSaveDependencies): TemplateSave {
  return {
    prepare(input) {
      const outcome = officeActionSave(input.officeAction, input.content)
      if (outcome.kind === 'refused') return outcome
      if (outcome.kind === 'content') {
        return { kind: 'ready', content: input.content, afterSave: () => Promise.resolve(NO_FINDINGS) }
      }
      return {
        kind: 'ready',
        content: outcome.body,
        async afterSave({ reportPath, displayPath, sessionId, signal }) {
          if (sessionId === undefined) {
            return 'Work page: not written, because this save has no chat. The office action board shows only an analysis that a chat saved.'
          }
          try {
            const saved = await deps.workPages.save({ reportPath, displayPath, findings: outcome.findings, sessionId, signal })
            deps.delivered?.mark(sessionId, saved.path)
            return saved.text
          } catch (error: unknown) {
            const reason = error instanceof Error ? error.message : String(error)
            deps.warn(`flowleap-deliverables: work page of ${displayPath} was not written: ${reason}`)
            return `Work page: not written, because ${reason}. The office action board does not show the findings of this save. Tell the attorney.`
          }
        },
      }
    },
  }
}
