import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'

/** The first request calls `record_read` for FL-2026-0001; the request after the tool result answers from the view. */
class RecordReadAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const last = options.messages.at(-1)
    if (last?.role === 'user') {
      const args = JSON.stringify({ file_number: 'FL-2026-0001' })
      const id = ToolCallId(`call-${options.messages.length}`)
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: 'record_read', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'record_read', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const result = last?.role === 'tool' ? last.content.map(block => block.type === 'text' ? block.text : '').join('') : ''
    const view = JSON.parse(result) as { recordSeq: number; deadlines: { due: string }[] }
    const reply = `Record position ${String(view.recordSeq)}; due ${view.deadlines[0]?.due ?? 'unknown'}.`
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'record-read-mock-llm'
export const inject = ['llm']

/**
 * Register the scripted adapter under the `record-read-mock` provider.
 * @param ctx - the plugin context supplying `ctx.llm`.
 */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['record-read-mock'], new RecordReadAdapter())
}
