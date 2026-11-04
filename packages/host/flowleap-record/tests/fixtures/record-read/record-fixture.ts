import { Service, type Context } from '@deepseek-ai/cordis'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import type {
  DocumentSha256, DocumentText, FlowleapRecord, MatterFileNumber, MatterViewResult, OutboxId, ProposalId, RecordCommandResult, RecordSeq,
  ReportReceipt, RunFinishReceipt, RunStartReceipt,
} from '@deepseek-ai/dsh-flowleap-record'
import { VIEW } from './view.ts'

/**
 * The Firm Record with one matter, FL-2026-0001 at record position 7, as the `flowleapRecord` service; each run command
 * answers its receipt.
 */
export default class RecordedFirmRecord extends Service implements FlowleapRecord {
  constructor(ctx: Context) {
    super(ctx, 'flowleapRecord')
  }

  async matterView(fileNumber: MatterFileNumber): Promise<MatterViewResult> {
    return fileNumber === VIEW.matter.fileNumber ? VIEW : { error: 'not_found' }
  }

  async runStarted(): Promise<RecordCommandResult<RunStartReceipt>> {
    return { recordSeq: brandNumber<RecordSeq>(8) }
  }

  async proposeReport(): Promise<RecordCommandResult<ReportReceipt>> {
    return {
      proposalId: brandString<ProposalId>('p-1'),
      document: brandString<DocumentSha256>('b'.repeat(64)),
      recordSeq: brandNumber<RecordSeq>(10),
    }
  }

  async documentText(): Promise<RecordCommandResult<DocumentText>> {
    return { pages: ['The EPO intends to grant a European patent.'] }
  }

  async finishRun(): Promise<RecordCommandResult<RunFinishReceipt>> {
    return { recordSeq: brandNumber<RecordSeq>(12), outbox: { id: brandString<OutboxId>('o-1'), state: 'queued' } }
  }
}
