import { Service, type Context } from '@deepseek-ai/cordis'
import type { FlowleapRecord, MatterFileNumber, MatterViewResult } from '@deepseek-ai/dsh-flowleap-record'
import { VIEW } from './view.ts'

/** The Firm Record with one matter, FL-2026-0001 at record position 7, as the `flowleapRecord` service. */
export default class RecordedFirmRecord extends Service implements FlowleapRecord {
  constructor(ctx: Context) {
    super(ctx, 'flowleapRecord')
  }

  async matterView(fileNumber: MatterFileNumber): Promise<MatterViewResult> {
    return fileNumber === VIEW.matter.fileNumber ? VIEW : { error: 'not_found' }
  }
}
