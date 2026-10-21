/**
 * The FlowLeap Patent Agent persona as a file-backed prompt section.
 *
 * The section text is owned outside this repository: `flowleap-agent-v2`
 * renders its `patentAIPrompt.tsx` to a Markdown artifact, and this row loads
 * that artifact into `ctx.systemPrompt` as the `flowleap:patent-agent` section
 * at order `0`, literally (no `{{…}}` interpolation). The file is read once
 * when the plugin applies; a Loader reload (HMR or a config change) applies
 * the plugin again and reads the current file. A missing or unreadable file
 * logs an error and registers nothing, so a profile boots without its persona
 * instead of failing; a relative path is a misconfiguration and rejects at
 * load.
 *
 * See packages/host/flowleap-prompt/README.md.
 *
 * @module @deepseek-ai/dsh-flowleap-prompt
 */

import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Cordis plugin name. */
export const name = 'flowleap-prompt'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

/** Name of the registered prompt section. */
export const SECTION_NAME = 'flowleap:patent-agent'

/** Order of the registered prompt section: the deployment persona slot. */
export const SECTION_ORDER = 0

/** Plugin config: where the persona Markdown lives. */
export interface Config {
  /** Absolute path of the Markdown file whose whole content becomes the section text. */
  path: string
}

/** Runtime schema for the prompt row. */
export const Config: z<Config> = z.object({
  path: z.string().required(),
})

/**
 * Read the persona file and register it as the `flowleap:patent-agent` section.
 * @param ctx - the mounting context; the section registers for its scope.
 * @param config - the absolute path of the persona Markdown file.
 * @throws when `config.path` is not absolute.
 */
export function apply(ctx: Context, config: Config): void {
  if (!isAbsolute(config.path)) {
    throw new Error(`flowleap-prompt: path must be absolute, got ${JSON.stringify(config.path)}`)
  }
  let text: string
  try {
    text = readFileSync(config.path, 'utf8')
  } catch (error) {
    ctx.logger.error(`flowleap-prompt: cannot read ${config.path}; no ${SECTION_NAME} section registered`, error)
    return
  }
  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text,
    interpolate: false,
  }), 'flowleap-prompt.section()')
}
