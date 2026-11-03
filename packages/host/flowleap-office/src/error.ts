/** The typed failure of the Office service. @module */

import type { FlowleapOfficeErrorCode } from './types.ts'

/** The one failure type of the Office service; consumers map `code` to a model-readable refusal. */
export class FlowleapOfficeError extends Error {
  /**
   * @param code - why the operation failed.
   * @param message - what failed, without document text beyond the refused value.
   */
  constructor(readonly code: FlowleapOfficeErrorCode, message: string) {
    super(message)
    this.name = 'FlowleapOfficeError'
  }
}
