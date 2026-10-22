/**
 * @deepseek-ai/dsh-flowleap-web — the FlowLeap Patent Agent profile layer.
 * The package is its bundle patches (`cordis.patch.yml` and
 * `presets/patent.patch.yml`, declared by the `dsh.bundle.patch` manifest
 * field) plus the data files the patch points rows at: the placeholder
 * persona file for `flowleap-prompt` and the default `brand/brand.json` for
 * `ui-brand-flowleap`; it mounts no plugin of its own.
 * @module @deepseek-ai/dsh-flowleap-web
 */

/**
 * The bundled placeholder persona, relative to this package root. The bundle
 * patch resolves it through the dsh installation as
 * `@deepseek-ai/dsh-flowleap-web/prompt/patent-agent.md`; `FLOWLEAP_PROMPT_PATH`
 * replaces it with the agent-v2 prompt export.
 */
export const PROMPT_FILE = 'prompt/patent-agent.md'

/**
 * The default brand file, relative to this package root. The bundle patch
 * resolves it through the dsh installation as
 * `@deepseek-ai/dsh-flowleap-web/brand/brand.json`; `FLOWLEAP_BRAND_PATH`
 * replaces it with a firm's own file. Its `mark` path resolves against the
 * file's own directory.
 */
export const BRAND_FILE = 'brand/brand.json'
