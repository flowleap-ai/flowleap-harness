import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'

/** Script one `bash` call with the test's command, then answer with its result. */
class SandboxNetworkAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const last = options.messages.at(-1)
    if (last?.role !== 'tool') {
      const command = process.env['DSH_TEST_SANDBOX_COMMAND']
      if (command === undefined) throw new Error('DSH_TEST_SANDBOX_COMMAND is not set')
      const args = JSON.stringify({ command, description: 'Probe the sandbox' })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: ToolCallId('call-probe'), name: 'bash', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('call-probe'), name: 'bash', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const reply = last.content.filter(block => block.type === 'text').map(block => block.text).join('')
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: reply.length } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'sandbox-network-mock-llm'
export const inject = ['llm']

/**
 * Register the scripted adapter under the `sandbox-network-mock` provider.
 * @param ctx - the plugin context supplying `ctx.llm`.
 */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['sandbox-network-mock'], new SandboxNetworkAdapter())
}
