/** Image-input proof for the model route that called a tool. @module */
import type { Context } from '@deepseek-ai/cordis'
import { imageInputSupport, type ImageInputSupport } from '@deepseek-ai/dsh-llm'
import type { ToolExecution } from './contracts.ts'

/**
 * Resolve whether the calling route reads images. The route is the Session's
 * latest request header config, then the Agent options.
 * @param ctx - the plugin context with the optional `llm` service.
 * @param exec - the tool execution whose Agent supplies the route.
 * @returns the calling route's image-input support.
 */
export function callerImageInput(ctx: Context, exec: ToolExecution): Promise<ImageInputSupport> {
  const routed = exec.agent?.session.requestHeader()?.config
  return imageInputSupport(ctx.get('llm'), routed?.provider ?? exec.agent?.options.provider, routed?.model ?? exec.agent?.options.model, exec.signal)
}
