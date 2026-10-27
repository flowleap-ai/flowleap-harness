import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'

/** A chat request creates a watch through `register_watch_create`; a tool result or a scheduled run gets a short answer. */
class RegisterWatchAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const last = options.messages.at(-1)
    const text = last?.role === 'user' ? last.content.map(block => block.type === 'text' ? block.text : '').join('') : ''
    if (last?.role === 'user' && !text.includes('[SCHEDULE REMINDER')) {
      const args = JSON.stringify({
        applications: ['EP 3 456 789'], title: 'Office actions', prompt: 'When a new office action arrives, prepare the analysis.',
        daily: { time: '07:00:00', time_zone: 'UTC' },
        // The headless profile has one chat and no Session controller: the run goes there, without a mark.
        new_chat_per_run: false, needs_review: false,
      })
      const id = ToolCallId(`call-${options.messages.length}`)
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: 'register_watch_create', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'register_watch_create', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const reply = last?.role === 'tool' ? 'Watch created.' : 'Run received.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'register-watch-mock-llm'
export const inject = ['llm']

/**
 * Register the scripted adapter under the `register-watch-mock` provider.
 * @param ctx - the plugin context supplying `ctx.llm`.
 */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['register-watch-mock'], new RegisterWatchAdapter())
}
