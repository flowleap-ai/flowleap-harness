/**
 * Image-input proof for one exact model route. Consumers that place images in a
 * model request use it before they store or send an image. `imageInputRefusal`
 * words a refusal; a consumer with its own error type words its own.
 * @module
 */

import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { LlmRuntime } from './index.ts'
import type { LlmResolvedModelInfo } from './types.ts'

/**
 * Whether one model route reads images. Only `declared` permits an image: an
 * unknown runtime, route, or adapter answer is negative.
 */
export type ImageInputSupport =
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'unverified'; readonly error: unknown }
  | { readonly kind: 'absent'; readonly model: string }
  | { readonly kind: 'declared'; readonly llm: LlmRuntime; readonly provider: string; readonly model: string; readonly info: LlmResolvedModelInfo }

/**
 * Resolve one route's metadata and require an explicit `image` input modality.
 * Adapter failures become `unverified`; this function does not throw.
 * @param llm - the optional LLM runtime; `undefined` gives `unresolved`.
 * @param provider - the routed provider, or `undefined` when the caller has none.
 * @param model - the exact routed model id, or `undefined` when the caller has none.
 * @param signal - optional cancellation for the adapter lookup.
 * @returns the route's image-input support.
 */
export async function imageInputSupport(
  llm: LlmRuntime | undefined,
  provider: string | undefined,
  model: string | undefined,
  signal?: AbortSignal,
): Promise<ImageInputSupport> {
  if (llm === undefined || provider === undefined || model === undefined) return { kind: 'unresolved' }
  let info: LlmResolvedModelInfo
  try {
    info = await llm.resolveModelInfo(provider, model, signal)
  } catch (error: unknown) {
    return { kind: 'unverified', error }
  }
  if (info.inputModalities?.includes('image') !== true) return { kind: 'absent', model }
  return { kind: 'declared', llm, provider, model, info }
}

/**
 * The reason text for a route that does not permit images.
 * @param support - a non-`declared` outcome of {@link imageInputSupport}.
 * @returns a short clause that names why the route reads no images.
 */
export function imageInputRefusal(support: Exclude<ImageInputSupport, { kind: 'declared' }>): string {
  switch (support.kind) {
    case 'unresolved': return 'the current model route could not be resolved'
    case 'unverified': return 'the current model route could not be verified'
    case 'absent': return `model "${support.model}" does not declare image input`
    /* v8 ignore next -- ImageInputSupport is closed; this retains compile-time exhaustiveness. */
    default: return assertNever(support)
  }
}
